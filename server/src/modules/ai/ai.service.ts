import type { AuthUser } from "../../common/access/auth-user";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { AiCredentialService } from "./ai-credential.service";
import { AiRepository } from "./ai.repository";
import type {
  AiStatusDto,
  GenerateJsonRequest,
  GenerateJsonResult,
  IAiCredentialResolver,
  IAiUsageRecorder,
  StreamTextRequest,
} from "./ai.types";
import { AiRequestError, noKeyError, toRequestError } from "./domain/ai-errors";
import { describeRejection } from "./domain/lenient";
import { parseJson } from "./domain/parse-json";
import { AI_PROVIDER_LABELS, AiProviderError, type AiGenerateResult } from "./providers/ai-provider";
import { providerFor, type AiProviderResolver } from "./providers/providers";

const noopUsage: IAiUsageRecorder = {
  record: async () => {},
};

/**
 * The ONLY thing feature code calls for AI (docs/ai-integration.md). Feature services build a
 * prompt from app data they loaded through the normal access-checked services, then call
 * generateJson (a draft that fills a form) or streamText (chat).
 */
export class AiService {
  private static _instance?: AiService;
  static get Instance(): AiService {
    return (this._instance ??= new AiService(providerFor, AiCredentialService.Instance, AiRepository.Instance));
  }

  // Public so tests can inject a fake provider and credentials; application code uses .Instance.
  constructor(
    private readonly providers: AiProviderResolver,
    private readonly credentials: IAiCredentialResolver,
    private readonly usage: IAiUsageRecorder = noopUsage,
  ) {}

  async status(actor: AuthUser): Promise<AiStatusDto> {
    const credential = await this.credentials.resolveFor(actor.id);
    return {
      available: credential !== null,
      source: credential?.source ?? null,
      provider: credential?.provider ?? null,
      providerLabel: credential ? AI_PROVIDER_LABELS[credential.provider] : null,
      model: credential?.model ?? null,
      storageReady: env.AI_KEYS_SECRET !== "",
    };
  }

  async generateJson<T>(actor: AuthUser, request: GenerateJsonRequest<T>): Promise<GenerateJsonResult<T>> {
    const credential = await this.requireCredential(actor, request.feature);
    const provider = this.providers(credential.provider);
    const providerLabel = AI_PROVIDER_LABELS[credential.provider];
    const whose = credential.source === "user" ? "your" : "the platform's";
    const startedAt = Date.now();

    let images = request.images ?? [];
    let imagesIgnored = false;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const send = (prompt: string, pictures: typeof images): Promise<AiGenerateResult> =>
      provider.generate(credential.apiKey, {
        model: credential.model,
        timeoutMs: request.timeoutMs ?? env.AI_REQUEST_TIMEOUT_MS,
        baseUrl: credential.baseUrl ?? undefined,
        system: request.system,
        prompt,
        images: pictures,
        schemaName: request.schemaName,
        jsonSchema: request.jsonSchema,
        maxOutputTokens: request.maxOutputTokens ?? 16_000,
      });

    const ask = async (prompt: string): Promise<AiGenerateResult> => {
      try {
        return await send(prompt, images);
      } catch (err) {
        if (
          images.length > 0 &&
          err instanceof AiProviderError &&
          (err.kind === "invalid_request" || /image|vision|multimodal|modalit/i.test(err.detail))
        ) {
          images = [];
          imagesIgnored = true;
          return send(prompt, []);
        }
        throw err;
      }
    };

    const check = (replyText: string): { ok: true; data: T } | { ok: false; problem: string } => {
      const json = parseJson(replyText);
      const parsed = request.schema.safeParse(json);
      if (parsed.success) return { ok: true, data: parsed.data };
      return { ok: false, problem: describeRejection(json, json === undefined ? null : parsed.error) };
    };

    try {
      const first = await ask(request.prompt);
      totalInputTokens += first.inputTokens;
      totalOutputTokens += first.outputTokens;
      let checked = check(first.text);

      if (!checked.ok) {
        const again = await ask(
          `${request.prompt}\n\nYour previous reply could not be used because ${checked.problem}. Reply again with only the JSON object, with every field present.`,
        );
        totalInputTokens += again.inputTokens;
        totalOutputTokens += again.outputTokens;
        checked = check(again.text);
      }

      if (!checked.ok) {
        const hint = request.rejectionHints?.find((h) => checked.problem.includes(h.includes));
        const message =
          hint?.message ??
          `The AI returned an answer in an unexpected format. Try again, or choose another model in the AI settings: "${credential.model}" may not be able to write this kind of draft.`;
        await this.recordUsage({
          userId: actor.id,
          keySource: credential.source,
          provider: credential.provider,
          model: credential.model,
          feature: request.feature,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          status: "error",
          errorKind: "invalid_output",
          durationMs: Date.now() - startedAt,
        });
        throw new AiRequestError(message, 502, "bad_output", { message: checked.problem });
      }

      await this.recordUsage({
        userId: actor.id,
        keySource: credential.source,
        provider: credential.provider,
        model: credential.model,
        feature: request.feature,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        status: "ok",
        errorKind: null,
        durationMs: Date.now() - startedAt,
      });

      return {
        data: checked.data,
        imagesIgnored,
        provider: credential.provider,
        model: credential.model,
        source: credential.source,
      };
    } catch (err) {
      if (err instanceof AiRequestError) throw err;
      const providerErr =
        err instanceof AiProviderError
          ? err
          : new AiProviderError("unavailable", err instanceof Error ? err.message : "Unknown AI failure");
      await this.recordUsage({
        userId: actor.id,
        keySource: credential.source,
        provider: credential.provider,
        model: credential.model,
        feature: request.feature,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        status: "error",
        errorKind: providerErr.kind,
        durationMs: Date.now() - startedAt,
      });
      const mapped = toRequestError(providerErr, { providerLabel, model: credential.model, whose });
      logger.warn(
        {
          reason: mapped.reason,
          provider: credential.provider,
          model: credential.model,
          feature: request.feature,
          detail: mapped.provider,
        },
        "AI request failed",
      );
      throw mapped;
    }
  }

  async streamText(actor: AuthUser, request: StreamTextRequest, onText: (delta: string) => void): Promise<{ text: string }> {
    const credential = await this.requireCredential(actor, request.feature);
    const provider = this.providers(credential.provider);
    const providerLabel = AI_PROVIDER_LABELS[credential.provider];
    const whose = credential.source === "user" ? "your" : "the platform's";
    const model = credential.chatModel ?? credential.model;
    const startedAt = Date.now();

    try {
      const result = await provider.stream(
        credential.apiKey,
        {
          model,
          baseUrl: credential.baseUrl ?? undefined,
          system: request.system,
          messages: request.messages,
          maxOutputTokens: request.maxOutputTokens ?? 8000,
        },
        onText,
      );
      await this.recordUsage({
        userId: actor.id,
        keySource: credential.source,
        provider: credential.provider,
        model,
        feature: request.feature,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        status: "ok",
        errorKind: null,
        durationMs: Date.now() - startedAt,
      });
      return { text: result.text };
    } catch (err) {
      const providerErr =
        err instanceof AiProviderError
          ? err
          : new AiProviderError("unavailable", err instanceof Error ? err.message : "Unknown AI failure");
      await this.recordUsage({
        userId: actor.id,
        keySource: credential.source,
        provider: credential.provider,
        model,
        feature: request.feature,
        inputTokens: 0,
        outputTokens: 0,
        status: "error",
        errorKind: providerErr.kind,
        durationMs: Date.now() - startedAt,
      });
      throw toRequestError(providerErr, { providerLabel, model, whose });
    }
  }

  private async requireCredential(actor: AuthUser, feature: GenerateJsonRequest<unknown>["feature"]) {
    const credential = await this.credentials.resolveFor(actor.id, feature);
    if (!credential) throw noKeyError();
    return credential;
  }

  private async recordUsage(entry: Parameters<IAiUsageRecorder["record"]>[0]): Promise<void> {
    try {
      await this.usage.record(entry);
    } catch (err) {
      logger.warn({ err }, "Failed to record AI usage log");
    }
  }
}

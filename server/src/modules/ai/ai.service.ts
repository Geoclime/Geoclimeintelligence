import type { AuthUser } from "../../common/access/auth-user";
import { AppError } from "../../common/errors/app-error";
import { env } from "../../config/env";
import type {
  AiStatusDto,
  GenerateJsonRequest,
  GenerateJsonResult,
  IAiCredentialResolver,
  ResolvedCredential,
  StreamTextRequest,
} from "./ai.types";
import { noKeyError } from "./domain/ai-errors";
import { AI_PROVIDER_LABELS } from "./providers/ai-provider";
import { providerFor, type AiProviderResolver } from "./providers/providers";

/** Stands in until Phase 1 adds key storage: there are no keys, so AI is never available. */
const noCredentials: IAiCredentialResolver = {
  resolveFor: async () => null,
};

/**
 * The ONLY thing feature code calls for AI (docs/ai-integration.md). Feature services build a
 * prompt from app data they loaded through the normal access-checked services, then call
 * generateJson (a draft that fills a form) or streamText (chat).
 *
 * Skeleton: the signatures are final, the flow is not built yet. Phase 1 fills in, per request:
 * resolve the key -> call the provider -> parse, validate, retry once with feedback -> record
 * usage (counts only) -> map failures to AiRequestError. Phase 2 adds credits.
 */
export class AiService {
  private static _instance?: AiService;
  static get Instance(): AiService {
    return (this._instance ??= new AiService(providerFor, noCredentials));
  }

  // Public so tests can inject a fake provider and credentials; application code uses .Instance.
  constructor(
    private readonly providers: AiProviderResolver,
    private readonly credentials: IAiCredentialResolver,
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
    throw notBuiltYet(credential);
  }

  async streamText(actor: AuthUser, request: StreamTextRequest, _onText: (delta: string) => void): Promise<{ text: string }> {
    const credential = await this.requireCredential(actor, request.feature);
    throw notBuiltYet(credential);
  }

  private async requireCredential(actor: AuthUser, feature: GenerateJsonRequest<unknown>["feature"]) {
    const credential = await this.credentials.resolveFor(actor.id, feature);
    if (!credential) throw noKeyError();
    return credential;
  }
}

function notBuiltYet(credential: ResolvedCredential): AppError {
  return new AppError(501, `AI requests through ${AI_PROVIDER_LABELS[credential.provider]} are not available yet`);
}

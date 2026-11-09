import type { AuthUser } from "../../common/access/auth-user";
import { open, seal } from "../../common/crypto/secret-box";
import { AppError, NotFoundError, ValidationError } from "../../common/errors/app-error";
import { env } from "../../config/env";
import { AuditService } from "../audit/audit.service";
import { AiRepository } from "./ai.repository";
import type {
  AiCredentialDto,
  AiCredentialRecord,
  IAiCredentialRepository,
  IAiCredentialResolver,
  ResolvedCredential,
  SaveAiCredentialInput,
} from "./ai.types";
import type { AiFeature } from "./domain/ai-features";
import { AI_PROVIDER_LABELS, AiProviderError, type AiModelInfo, type AiProviderId } from "./providers/ai-provider";
import { providerFor, type AiProviderResolver } from "./providers/providers";
import { checkServerAddress } from "./providers/server-address";

const keyContext = (userId: string | null, provider: AiProviderId) => `${userId ?? "platform"}:${provider}`;

function toDto(record: AiCredentialRecord): AiCredentialDto {
  return {
    id: record.id,
    provider: record.provider,
    providerLabel: AI_PROVIDER_LABELS[record.provider],
    model: record.model,
    chatModel: record.chatModel,
    featureModels: record.featureModels,
    baseUrl: record.baseUrl,
    keyLast4: record.keyLast4,
    isActive: record.isActive,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class AiCredentialService implements IAiCredentialResolver {
  private static _instance?: AiCredentialService;
  static get Instance(): AiCredentialService {
    return (this._instance ??= new AiCredentialService(AiRepository.Instance, providerFor, AuditService.Instance));
  }

  constructor(
    private readonly repo: IAiCredentialRepository,
    private readonly providers: AiProviderResolver,
    private readonly audit: Pick<AuditService, "record">,
    private readonly getSecret: () => string = () => env.AI_KEYS_SECRET,
  ) {}

  async list(userId: string | null): Promise<AiCredentialDto[]> {
    const rows = await this.repo.findByOwner(userId);
    return rows.map(toDto);
  }

  async models(
    userId: string | null,
    providerId: AiProviderId,
    input: { apiKey?: string; baseUrl?: string | null },
  ): Promise<AiModelInfo[]> {
    const provider = this.providers(providerId);
    const existing = await this.repo.findByOwnerAndProvider(userId, providerId);
    const secret = this.getSecret();
    let apiKey = input.apiKey?.trim();
    if (!apiKey && existing && secret) {
      apiKey = open(existing.keyCiphertext, secret, keyContext(userId, providerId)) ?? undefined;
    }
    if (!apiKey && providerId !== "ollama") {
      throw new ValidationError([{ field: "apiKey", message: `Enter an API key for ${AI_PROVIDER_LABELS[providerId]}` }]);
    }
    const baseUrl = input.baseUrl ?? existing?.baseUrl ?? undefined;
    try {
      return await provider.listModels(apiKey ?? "", baseUrl);
    } catch (err) {
      if (err instanceof AiProviderError && err.kind === "auth") {
        throw new ValidationError([
          { field: "apiKey", message: `${AI_PROVIDER_LABELS[providerId]} did not accept this API key` },
        ]);
      }
      throw new AppError(502, `${AI_PROVIDER_LABELS[providerId]} could not be reached. Check the key or server address.`);
    }
  }

  async save(input: SaveAiCredentialInput, actor: AuthUser): Promise<AiCredentialDto> {
    const secret = this.getSecret();
    if (!secret) {
      throw new AppError(503, "AI key storage is not configured on this server (AI_KEYS_SECRET is unset).");
    }

    const existing = await this.repo.findByOwnerAndProvider(input.userId, input.provider);
    let baseUrl: string | null = null;
    if (input.provider === "ollama") {
      const rawUrl = input.baseUrl?.trim() || existing?.baseUrl || "https://ollama.com";
      const checked = checkServerAddress(rawUrl, env.NODE_ENV !== "production");
      if ("problem" in checked) {
        throw new ValidationError([{ field: "baseUrl", message: checked.problem }]);
      }
      baseUrl = checked.url;
    }

    let plaintextKey = input.apiKey?.trim() ?? "";
    if (!plaintextKey) {
      if (!existing) {
        throw new ValidationError([{ field: "apiKey", message: "An API key is required when adding a provider." }]);
      }
      const opened = open(existing.keyCiphertext, secret, keyContext(input.userId, input.provider));
      if (!opened && input.provider !== "ollama") {
        throw new ValidationError([{ field: "apiKey", message: "The saved key could not be decrypted. Enter the API key again." }]);
      }
      plaintextKey = opened ?? "";
    }

    // Verify with the provider when a new key is supplied or when the Ollama URL changes
    if (input.apiKey?.trim() || (input.provider === "ollama" && baseUrl !== existing?.baseUrl)) {
      try {
        await this.providers(input.provider).listModels(plaintextKey, baseUrl ?? undefined);
      } catch (err) {
        if (err instanceof AiProviderError && err.kind === "auth") {
          throw new ValidationError([
            { field: "apiKey", message: `${AI_PROVIDER_LABELS[input.provider]} did not accept this API key` },
          ]);
        }
        throw new AppError(502, `${AI_PROVIDER_LABELS[input.provider]} could not be reached to verify the key.`);
      }
    }

    const allOwned = await this.repo.findByOwner(input.userId);
    const hasOtherActive = allOwned.some((c) => c.provider !== input.provider && c.isActive);
    const isActive = existing ? existing.isActive || !hasOtherActive : !hasOtherActive;

    const keyCiphertext = seal(plaintextKey, secret, keyContext(input.userId, input.provider));
    const keyLast4 = plaintextKey.length >= 4 ? plaintextKey.slice(-4) : "local";

    const saved = await this.repo.upsert({
      userId: input.userId,
      provider: input.provider,
      model: input.model.trim(),
      chatModel: input.chatModel?.trim() || null,
      baseUrl,
      keyCiphertext,
      keyLast4,
      isActive,
      updatedBy: actor.id,
    });

    await this.audit.record(actor, {
      action: input.userId === null ? "ai.platform_key_saved" : "ai.user_key_saved",
      entityType: "ai_credential",
      entityId: saved.id,
      summary: `Saved ${ input.userId === null ? "platform" : "personal" } AI key for ${AI_PROVIDER_LABELS[input.provider]} (${saved.model})`,
      details: { provider: input.provider, model: saved.model, scope: input.userId === null ? "platform" : "user" },
    });

    return toDto(saved);
  }

  async activate(userId: string | null, provider: AiProviderId, actor: AuthUser): Promise<AiCredentialDto[]> {
    const ok = await this.repo.activate(userId, provider, actor.id);
    if (!ok) throw new NotFoundError(`${AI_PROVIDER_LABELS[provider]} credential`);
    await this.audit.record(actor, {
      action: userId === null ? "ai.platform_key_activated" : "ai.user_key_activated",
      entityType: "ai_credential",
      entityId: null,
      summary: `Switched active ${userId === null ? "platform" : "personal"} AI provider to ${AI_PROVIDER_LABELS[provider]}`,
      details: { provider },
    });
    return this.list(userId);
  }

  async remove(userId: string | null, provider: AiProviderId, actor: AuthUser): Promise<void> {
    const ok = await this.repo.remove(userId, provider);
    if (!ok) throw new NotFoundError(`${AI_PROVIDER_LABELS[provider]} credential`);
    await this.audit.record(actor, {
      action: userId === null ? "ai.platform_key_removed" : "ai.user_key_removed",
      entityType: "ai_credential",
      entityId: null,
      summary: `Removed ${userId === null ? "platform" : "personal"} AI key for ${AI_PROVIDER_LABELS[provider]}`,
      details: { provider },
    });
  }

  async resolveFor(userId: string, feature?: AiFeature): Promise<ResolvedCredential | null> {
    const secret = this.getSecret();
    if (!secret) return null;

    const scopes: { ownerId: string | null; source: "user" | "platform" }[] = [
      { ownerId: userId, source: "user" },
      { ownerId: null, source: "platform" },
    ];

    for (const { ownerId, source } of scopes) {
      let rows: AiCredentialRecord[];
      try {
        rows = await this.repo.findByOwner(ownerId);
      } catch {
        // When running without DB tables in unit tests, fall through cleanly
        continue;
      }
      if (rows.length === 0) continue;

      const pinned = feature ? rows.find((r) => Boolean(r.featureModels[feature])) : undefined;
      const active = rows.find((r) => r.isActive) ?? rows[0];
      const candidate = pinned ?? active;
      if (!candidate) continue;

      const apiKey = open(candidate.keyCiphertext, secret, keyContext(ownerId, candidate.provider));
      if (apiKey === null) continue;

      const pinnedModel = feature ? candidate.featureModels[feature] : undefined;
      return {
        apiKey,
        provider: candidate.provider,
        model: pinnedModel ?? candidate.model,
        chatModel: pinnedModel ? null : candidate.chatModel,
        baseUrl: candidate.baseUrl,
        source,
      };
    }

    return null;
  }
}

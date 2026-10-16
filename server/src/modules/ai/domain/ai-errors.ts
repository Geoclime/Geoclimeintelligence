import { AppError } from "../../../common/errors/app-error";
import type { AiProviderError } from "../providers/ai-provider";

export const AI_FAILURE_REASONS = [
  "no_key",
  "no_credits",
  "key_rejected",
  "provider_account",
  "model_rejected",
  "busy",
  "unreachable",
  "refused",
  "bad_output",
] as const;
export type AiFailureReason = (typeof AI_FAILURE_REASONS)[number];

/** Failures that persist until whoever pays for the AI (the key's owner) does something. */
export const NEEDS_PAYER_ACTION: ReadonlySet<AiFailureReason> = new Set([
  "no_key",
  "no_credits",
  "key_rejected",
  "provider_account",
  "model_rejected",
]);

/**
 * A failed AI request, with a message a non-technical user can act on. `provider` carries the
 * vendor's own status and text for logs only; the error handler sends just `message`.
 */
export class AiRequestError extends AppError {
  constructor(
    message: string,
    statusCode: number,
    public readonly reason: AiFailureReason,
    public readonly provider?: { status?: number; message: string },
  ) {
    super(statusCode, message);
  }
}

export const noKeyError = () =>
  new AiRequestError("AI is not set up yet. Add an API key in Settings to use it.", 503, "no_key");

export interface FailureContext {
  providerLabel: string;
  model: string;
  /** Whose key it was: "the platform's" or "your". */
  whose: string;
}

/** Maps a normalised provider failure to the message, status and reason the client sees. */
export function toRequestError(err: AiProviderError, { providerLabel: p, model, whose }: FailureContext): AiRequestError {
  const detail = { status: err.status, message: err.detail.slice(0, 600) };
  switch (err.kind) {
    case "auth":
      return new AiRequestError(
        `${p} rejected ${whose} API key. It may have been revoked or run out of credit.`,
        502,
        "key_rejected",
        detail,
      );
    case "account":
      return new AiRequestError(
        `${p} refused this because of the account behind ${whose} API key: the model "${model}" may need a subscription or a higher plan, or the quota or balance has run out. Check the account with ${p}, or choose another model.`,
        502,
        "provider_account",
        detail,
      );
    case "rate_limit":
      return new AiRequestError(`${p} is limiting requests right now. Try again in a minute.`, 503, "busy", detail);
    case "invalid_request":
      return new AiRequestError(
        `${p} could not run this with the model "${model}". Choose another model in the AI settings.`,
        502,
        "model_rejected",
        detail,
      );
    case "refused":
      return new AiRequestError("The AI declined to respond to this content.", 422, "refused", detail);
    case "truncated":
      return new AiRequestError("The AI's answer was cut off before it finished. Try again.", 502, "bad_output", detail);
    default:
      return new AiRequestError(`${p} did not respond. Try again in a moment.`, 502, "unreachable", detail);
  }
}

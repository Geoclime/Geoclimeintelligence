import { isAxiosError } from "axios";
import type { ApiResponse, ValidationError } from "../types/api.types";

export type ApiErrorKind = "http" | "network" | "timeout" | "offline";

/**
 * The one error type every endpoint function rejects with. Hooks and forms read `message`
 * (safe to show a user as-is), `status`, and `fieldErrors` (a 400's per-field list, ready to
 * map onto form fields). Nothing above the transport layer ever inspects an AxiosError.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: ApiErrorKind,
    readonly status: number | null = null,
    readonly fieldErrors: ValidationError[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

const STATUS_FALLBACK: Record<number, string> = {
  400: "Some of the information sent was not valid.",
  401: "Your session has expired. Please sign in again.",
  403: "You don't have permission to do that.",
  404: "We couldn't find what you were looking for.",
  413: "That upload is too large.",
  429: "Too many requests. Please wait a moment and try again.",
};

function isEnvelope(body: unknown): body is ApiResponse<unknown> {
  return typeof body === "object" && body !== null && "success" in body && "message" in body;
}

/**
 * Normalises anything thrown by axios into an ApiError. Envelope messages come from the
 * backend's errorHandler, which never leaks internals, so they are shown verbatim. Anything
 * that isn't our envelope (a proxy's HTML 502 page, a timeout) gets a plain-language fallback.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (isAxiosError(error)) {
    const { response } = error;
    if (response) {
      const body = response.data as unknown;
      if (isEnvelope(body) && body.message) {
        return new ApiError(body.message, "http", response.status, body.errors ?? []);
      }
      const fallback =
        STATUS_FALLBACK[response.status] ??
        (response.status >= 500
          ? "The server ran into a problem. Please try again shortly."
          : "The request could not be completed.");
      return new ApiError(fallback, "http", response.status);
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return new ApiError("You're offline. Check your connection and try again.", "offline");
    }
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return new ApiError("The server took too long to respond. Please try again.", "timeout");
    }
    return new ApiError("We couldn't reach the server. Please try again shortly.", "network");
  }

  return new ApiError("Something unexpected went wrong.", "network");
}

/** A short user-facing message for any thrown value: what hooks put in their `error` state. */
export function errorMessage(error: unknown): string {
  return toApiError(error).message;
}

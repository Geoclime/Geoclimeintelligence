import axios, { isAxiosError, type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { env } from "../config/env";
import { toApiError } from "./api-error";
import { identity } from "./identity";

declare module "axios" {
  interface AxiosRequestConfig {
    /** Set once a 401 has triggered a forced token refresh, so it is retried only once. */
    _authRetried?: boolean;
    /** How many times a failed GET has been retried after a network error or a 502/503/504. */
    _retryCount?: number;
  }
}

/**
 * The single HTTP client (standard section 5). Every endpoint function uses it; nothing else
 * may import axios (enforced by eslint.config.js). Every rejection is an ApiError.
 */
export const httpClient = axios.create({
  baseURL: env.VITE_API_URL,
  // Generous because the API's free hosting tier sleeps when idle and takes a while to wake.
  timeout: 20_000,
  headers: { Accept: "application/json" },
});

// Attach the current Firebase ID token to every request. The SDK caches it and refreshes it
// before expiry; this only asks for it. No token is ever stored or parsed here.
httpClient.interceptors.request.use(async (config) => {
  const token = await identity.getIdToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Retry delays for idempotent reads: covers a cold start or a brief network drop. */
const GET_RETRY_DELAYS_MS = [1_000, 3_000];
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableRead(error: AxiosError, config: InternalAxiosRequestConfig): boolean {
  if ((config.method ?? "get").toLowerCase() !== "get") return false;
  if ((config._retryCount ?? 0) >= GET_RETRY_DELAYS_MS.length) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  return !error.response || RETRYABLE_STATUSES.has(error.response.status);
}

httpClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const config = isAxiosError(error) ? error.config : undefined;
    if (!isAxiosError(error) || !config) throw toApiError(error);

    // 401: the token may have been revoked or expired early. Force one refresh and retry once.
    // If that still fails, the Firebase session itself is invalid; AuthContext signs the user out.
    if (error.response?.status === 401 && !config._authRetried) {
      const freshToken = await identity.getIdToken(true).catch(() => null);
      if (freshToken) {
        config._authRetried = true;
        return httpClient.request(config);
      }
    }

    if (isRetryableRead(error, config)) {
      const attempt = config._retryCount ?? 0;
      config._retryCount = attempt + 1;
      await wait(GET_RETRY_DELAYS_MS[attempt] ?? 0);
      return httpClient.request(config);
    }

    throw toApiError(error);
  },
);

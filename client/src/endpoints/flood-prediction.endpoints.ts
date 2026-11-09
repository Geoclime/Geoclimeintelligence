import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type {
  AlertDraft,
  AreaFloodOutlook,
  FloodPrediction,
  FloodPredictionList,
  FloodPredictionSettings,
  PublicFloodOutlook,
} from "../types/flood-prediction.types";
import { DEFAULT_OUTLOOK_DAYS } from "../types/flood-prediction.types";

export async function fetchFloodPredictions(
  countryCode = "NGA",
  days = DEFAULT_OUTLOOK_DAYS,
): Promise<ApiResponse<FloodPredictionList>> {
  const { data } = await httpClient.get<ApiResponse<FloodPredictionList>>("/api/v1/flood-predictions", {
    params: { countryCode, days },
  });
  return data;
}

export async function fetchAreaFloodOutlook(
  adminUnitId: string,
  days = DEFAULT_OUTLOOK_DAYS,
): Promise<ApiResponse<AreaFloodOutlook>> {
  const { data } = await httpClient.get<ApiResponse<AreaFloodOutlook>>(
    `/api/v1/flood-predictions/areas/${encodeURIComponent(adminUnitId)}`,
    { params: { days } },
  );
  return data;
}

export async function generateAreaAiOutlook(
  adminUnitId: string,
  days = DEFAULT_OUTLOOK_DAYS,
): Promise<ApiResponse<FloodPrediction>> {
  const { data } = await httpClient.post<ApiResponse<FloodPrediction>>(
    `/api/v1/flood-predictions/areas/${encodeURIComponent(adminUnitId)}/ai-outlook`,
    { days },
  );
  return data;
}

/** Recomputes every LGA from the weather API, so it takes far longer than the client's usual 20 seconds. */
const REFRESH_TIMEOUT_MS = 120_000;

export async function refreshFloodPredictions(countryCode = "NGA"): Promise<ApiResponse<FloodPredictionList>> {
  const { data } = await httpClient.post<ApiResponse<FloodPredictionList>>(
    "/api/v1/flood-predictions/refresh",
    { countryCode },
    { timeout: REFRESH_TIMEOUT_MS },
  );
  return data;
}

export async function draftAlertFromForecast(areaIds: string[]): Promise<ApiResponse<AlertDraft>> {
  const { data } = await httpClient.post<ApiResponse<AlertDraft>>("/api/v1/flood-predictions/draft-alert", {
    areaIds,
  });
  return data;
}

export async function fetchFloodPredictionSettings(): Promise<ApiResponse<FloodPredictionSettings>> {
  const { data } = await httpClient.get<ApiResponse<FloodPredictionSettings>>("/api/v1/flood-predictions/settings");
  return data;
}

export async function updateFloodPredictionSettings(patch: {
  showPublicFloodOutlook?: boolean;
  publicOutlookDays?: number;
}): Promise<ApiResponse<FloodPredictionSettings>> {
  const { data } = await httpClient.patch<ApiResponse<FloodPredictionSettings>>(
    "/api/v1/flood-predictions/settings",
    patch,
  );
  return data;
}

export async function fetchPublicFloodOutlook(): Promise<ApiResponse<PublicFloodOutlook>> {
  const { data } = await httpClient.get<ApiResponse<PublicFloodOutlook>>("/api/v1/public/flood-outlook");
  return data;
}

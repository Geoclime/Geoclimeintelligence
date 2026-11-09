import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type {
  AlertDraft,
  AreaFloodOutlook,
  FloodPrediction,
  FloodPredictionList,
  FloodPredictionSettings,
  PredictionHorizon,
  PublicFloodOutlook,
} from "../types/flood-prediction.types";

export async function fetchFloodPredictions(
  countryCode = "NGA",
  horizon: PredictionHorizon = "7d",
): Promise<ApiResponse<FloodPredictionList>> {
  const { data } = await httpClient.get<ApiResponse<FloodPredictionList>>("/api/v1/flood-predictions", {
    params: { countryCode, horizon },
  });
  return data;
}

export async function fetchAreaFloodOutlook(adminUnitId: string): Promise<ApiResponse<AreaFloodOutlook>> {
  const { data } = await httpClient.get<ApiResponse<AreaFloodOutlook>>(
    `/api/v1/flood-predictions/areas/${encodeURIComponent(adminUnitId)}`,
  );
  return data;
}

export async function generateAreaAiOutlook(
  adminUnitId: string,
  horizon: PredictionHorizon = "7d",
): Promise<ApiResponse<FloodPrediction>> {
  const { data } = await httpClient.post<ApiResponse<FloodPrediction>>(
    `/api/v1/flood-predictions/areas/${encodeURIComponent(adminUnitId)}/ai-outlook`,
    { horizon },
  );
  return data;
}

export async function refreshFloodPredictions(countryCode = "NGA"): Promise<ApiResponse<FloodPredictionList>> {
  const { data } = await httpClient.post<ApiResponse<FloodPredictionList>>("/api/v1/flood-predictions/refresh", {
    countryCode,
  });
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
  publicOutlookHorizon?: PredictionHorizon;
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

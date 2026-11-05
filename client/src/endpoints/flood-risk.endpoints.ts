import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type { ImportRun } from "../types/import.types";
import type { AreaFloodRisk, FloodRiskLayer, FloodRiskPoint, StartFloodRiskImportInput } from "../types/flood-risk.types";

// server/src/modules/flood-risk/flood-risk.routes.ts (any signed-in user) and the two flood risk
// routes under server/src/modules/data-sources/imports/import.routes.ts (administrators).

/** The country's live map, or `data: null` when none has been promoted yet. */
export async function fetchFloodRiskLayer(countryCode: string): Promise<ApiResponse<FloodRiskLayer | null>> {
  const { data } = await httpClient.get<ApiResponse<FloodRiskLayer | null>>("/api/v1/flood-risk", { params: { countryCode } });
  return data;
}

/** The picture itself, as a file: it is not wrapped in the JSON envelope. */
export async function fetchFloodRiskImage(layerId: string): Promise<Blob> {
  const response = await httpClient.get<Blob>(`/api/v1/flood-risk/layers/${encodeURIComponent(layerId)}/image`, { responseType: "blob" });
  return response.data;
}

/** The map an import run staged (or made live), for the review screen. */
export async function fetchRunFloodRisk(runId: string): Promise<ApiResponse<FloodRiskLayer>> {
  const { data } = await httpClient.get<ApiResponse<FloodRiskLayer>>(`/api/v1/imports/${encodeURIComponent(runId)}/flood-risk`);
  return data;
}

/** How at risk one LGA or ward is; `data: null` when it wasn't measured or there is no live map. */
export async function fetchAreaFloodRisk(adminUnitId: string): Promise<ApiResponse<AreaFloodRisk | null>> {
  const { data } = await httpClient.get<ApiResponse<AreaFloodRisk | null>>(`/api/v1/flood-risk/areas/${encodeURIComponent(adminUnitId)}`);
  return data;
}

/** The class under a point in the country's live map. */
export async function fetchFloodRiskAt(lon: number, lat: number, countryCode: string): Promise<ApiResponse<FloodRiskPoint | null>> {
  const { data } = await httpClient.get<ApiResponse<FloodRiskPoint | null>>("/api/v1/flood-risk/at", { params: { lon, lat, countryCode } });
  return data;
}

/** Creates a run from a classified GeoTIFF: measured against every LGA and ward, live only once promoted. */
export async function startFloodRiskImport(input: StartFloodRiskImportInput): Promise<ApiResponse<ImportRun>> {
  const form = new FormData();
  form.append("file", input.file, input.file.name);
  form.append("countryCode", input.countryCode);
  form.append("sourceId", input.sourceId);
  if (input.title) form.append("title", input.title);
  const { data } = await httpClient.post<ApiResponse<ImportRun>>("/api/v1/imports/flood-risk", form, { timeout: 180_000 });
  return data;
}

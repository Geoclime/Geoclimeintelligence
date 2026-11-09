import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type { ImportRun } from "../types/import.types";
import type { AreaSatelliteFlood, SatelliteFloodLayer, SatelliteFloodList, StartSatelliteFloodImportInput } from "../types/satellite-flood.types";

// server/src/modules/satellite-flood/satellite-flood.routes.ts (any signed-in user) and the two
// satellite flood routes under server/src/modules/data-sources/imports/import.routes.ts (administrators).

/** Every live month for the country, newest first (an empty list when none has been promoted). */
export async function fetchSatelliteFloods(countryCode: string): Promise<ApiResponse<SatelliteFloodList>> {
  const { data } = await httpClient.get<ApiResponse<SatelliteFloodList>>("/api/v1/satellite-floods", { params: { countryCode } });
  return data;
}

/** One month's picture, as a file: it is not wrapped in the JSON envelope. */
export async function fetchSatelliteFloodImage(layerId: string): Promise<Blob> {
  const response = await httpClient.get<Blob>(`/api/v1/satellite-floods/layers/${encodeURIComponent(layerId)}/image`, { responseType: "blob" });
  return response.data;
}

/** One LGA's or ward's live months, oldest first. */
export async function fetchAreaSatelliteFlood(adminUnitId: string): Promise<ApiResponse<AreaSatelliteFlood>> {
  const { data } = await httpClient.get<ApiResponse<AreaSatelliteFlood>>(`/api/v1/satellite-floods/areas/${encodeURIComponent(adminUnitId)}`);
  return data;
}

/** The month an import run staged (or made live), for the review screen. */
export async function fetchRunSatelliteFlood(runId: string): Promise<ApiResponse<SatelliteFloodLayer>> {
  const { data } = await httpClient.get<ApiResponse<SatelliteFloodLayer>>(`/api/v1/imports/${encodeURIComponent(runId)}/satellite-flood`);
  return data;
}

/** Creates a run from one month's tiles (.mbtiles): measured against every LGA and ward, live only once promoted. */
export async function startSatelliteFloodImport(input: StartSatelliteFloodImportInput): Promise<ApiResponse<ImportRun>> {
  const form = new FormData();
  form.append("file", input.file, input.file.name);
  form.append("countryCode", input.countryCode);
  form.append("sourceId", input.sourceId);
  if (input.yearMonth) form.append("yearMonth", input.yearMonth);
  const { data } = await httpClient.post<ApiResponse<ImportRun>>("/api/v1/imports/satellite-flood", form, { timeout: 180_000 });
  return data;
}

import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type {
  Drainage,
  DrainageFeatureCollection,
  FloodExtent,
  FloodExtentFeatureCollection,
  FloodExtentWithImpact,
  FloodHistory,
  FloodImpact,
  NewDrainageBody,
  NewFloodExtentBody,
  UpdateDrainageBody,
} from "../types/field-survey.types";
import type { OverlayLayerParams } from "../types/map-layer.types";

// server/src/modules/field-survey/field-survey.routes.ts. Reading: any signed-in user. Recording,
// re-inspecting and receding: responders, officials and administrators. Deleting: whoever recorded it, or an administrator.

/** Saves the outline of a flood and returns it with what it reaches. */
export async function saveFloodExtent(body: NewFloodExtentBody): Promise<ApiResponse<FloodExtentWithImpact>> {
  const { data } = await httpClient.post<ApiResponse<FloodExtentWithImpact>>("/api/v1/flood-extents", body);
  return data;
}

export async function fetchFloodImpact(id: string): Promise<ApiResponse<FloodImpact>> {
  const { data } = await httpClient.get<ApiResponse<FloodImpact>>(`/api/v1/flood-extents/${encodeURIComponent(id)}/impact`);
  return data;
}

/** Every flood recorded in an LGA or ward, newest first (the latest `limit`), with totals over all of them. */
export async function fetchFloodHistory(areaId: string, limit = 20): Promise<ApiResponse<FloodHistory>> {
  const { data } = await httpClient.get<ApiResponse<FloodHistory>>("/api/v1/flood-extents/history", { params: { areaId, limit } });
  return data;
}

/** The water has gone down: the shape stays as a record and leaves the map after a week. */
export async function recedeFloodExtent(id: string): Promise<ApiResponse<FloodExtent>> {
  const { data } = await httpClient.post<ApiResponse<FloodExtent>>(`/api/v1/flood-extents/${encodeURIComponent(id)}/recede`);
  return data;
}

export async function deleteFloodExtent(id: string): Promise<ApiResponse<null>> {
  const { data } = await httpClient.delete<ApiResponse<null>>(`/api/v1/flood-extents/${encodeURIComponent(id)}`);
  return data;
}

export async function saveDrainage(body: NewDrainageBody): Promise<ApiResponse<Drainage>> {
  const { data } = await httpClient.post<ApiResponse<Drainage>>("/api/v1/drainage", body);
  return data;
}

/** An inspection: changes what was sent and moves "last checked" to now. */
export async function updateDrainage(id: string, body: UpdateDrainageBody): Promise<ApiResponse<Drainage>> {
  const { data } = await httpClient.patch<ApiResponse<Drainage>>(`/api/v1/drainage/${encodeURIComponent(id)}`, body);
  return data;
}

export async function deleteDrainage(id: string): Promise<ApiResponse<null>> {
  const { data } = await httpClient.delete<ApiResponse<null>>(`/api/v1/drainage/${encodeURIComponent(id)}`);
  return data;
}

/** The two survey layers and their GeoJSON replies. bbox is required, as for every map layer. */
export interface SurveyCollections {
  "flood-extents": FloodExtentFeatureCollection;
  drainage: DrainageFeatureCollection;
}
export type SurveyLayerPath = keyof SurveyCollections;

export async function fetchSurveyGeoJson<L extends SurveyLayerPath>(layer: L, params: OverlayLayerParams): Promise<ApiResponse<SurveyCollections[L]>> {
  const { bbox, ...rest } = params;
  const { data } = await httpClient.get<ApiResponse<SurveyCollections[L]>>(`/api/v1/${layer}/geojson`, { params: { ...rest, bbox: bbox.join(",") } });
  return data;
}

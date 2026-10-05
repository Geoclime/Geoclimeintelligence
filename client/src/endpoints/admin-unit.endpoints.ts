import { httpClient } from "../transport/http";
import type {
  AdminUnitDetail,
  AdminUnitFeatureCollection,
  AdminUnitLayerParams,
  AdminUnitListParams,
  AdminUnitSummary,
  ChildListParams,
  LocateResult,
} from "../types/admin-unit.types";
import type { ApiResponse } from "../types/api.types";

// server/src/modules/admin-units/admin-unit.routes.ts. Any signed-in user may call these.

/** Paged names, codes and levels. Never shapes (backend standard section 10). */
export async function fetchAdminUnits(params: AdminUnitListParams): Promise<ApiResponse<AdminUnitSummary[]>> {
  const { data } = await httpClient.get<ApiResponse<AdminUnitSummary[]>>("/api/v1/admin-units", { params });
  return data;
}

/** One area with its parent, source and full shape. */
export async function fetchAdminUnit(id: string): Promise<ApiResponse<AdminUnitDetail>> {
  const { data } = await httpClient.get<ApiResponse<AdminUnitDetail>>(`/api/v1/admin-units/${encodeURIComponent(id)}`);
  return data;
}

/** The wards of an LGA, or the LGAs of the state. */
export async function fetchAdminUnitChildren(id: string, params: ChildListParams): Promise<ApiResponse<AdminUnitSummary[]>> {
  const { data } = await httpClient.get<ApiResponse<AdminUnitSummary[]>>(
    `/api/v1/admin-units/${encodeURIComponent(id)}/children`,
    { params },
  );
  return data;
}

// bbox is REQUIRED, never optional: the server refuses to hand back shapes without one, and so
// does this function's signature (standard section 6).
export async function fetchAdminUnitsGeoJson(params: AdminUnitLayerParams): Promise<ApiResponse<AdminUnitFeatureCollection>> {
  const { bbox, ...rest } = params;
  const { data } = await httpClient.get<ApiResponse<AdminUnitFeatureCollection>>("/api/v1/admin-units/geojson", {
    params: { ...rest, bbox: bbox.join(",") },
  });
  return data;
}

/** The state, LGA and ward containing a point. Rejects with a 404 ApiError outside every mapped area. */
export async function locatePoint(lon: number, lat: number): Promise<ApiResponse<LocateResult>> {
  const { data } = await httpClient.get<ApiResponse<LocateResult>>("/api/v1/admin-units/locate", { params: { lon, lat } });
  return data;
}

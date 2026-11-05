import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type { BBox } from "../types/admin-unit.types";
import type { Household, HouseholdFeatureCollection, HouseholdPatch, NewHouseholdBody } from "../types/household.types";

// server/src/modules/households/household.routes.ts. Anyone signed in manages their own households; the
// map shows the viewer's own, or everyone's for staff with households.view. Never public.

export async function fetchHouseholdGeoJson(bbox: BBox): Promise<ApiResponse<HouseholdFeatureCollection>> {
  const { data } = await httpClient.get<ApiResponse<HouseholdFeatureCollection>>("/api/v1/households/geojson", { params: { bbox: bbox.join(",") } });
  return data;
}

export async function fetchMyHouseholds(): Promise<ApiResponse<Household[]>> {
  const { data } = await httpClient.get<ApiResponse<Household[]>>("/api/v1/households/mine");
  return data;
}

export async function saveHousehold(body: NewHouseholdBody): Promise<ApiResponse<Household>> {
  const { data } = await httpClient.post<ApiResponse<Household>>("/api/v1/households", body);
  return data;
}

export async function updateHousehold(id: string, patch: HouseholdPatch): Promise<ApiResponse<Household>> {
  const { data } = await httpClient.patch<ApiResponse<Household>>(`/api/v1/households/${encodeURIComponent(id)}`, patch);
  return data;
}

export async function deleteHousehold(id: string): Promise<ApiResponse<null>> {
  const { data } = await httpClient.delete<ApiResponse<null>>(`/api/v1/households/${encodeURIComponent(id)}`);
  return data;
}

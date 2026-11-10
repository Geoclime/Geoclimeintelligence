import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type { BBox } from "../types/admin-unit.types";
import type { Household, HouseholdFeatureCollection, HouseholdHit, HouseholdPatch, HouseholdPhoto, NewHouseholdBody } from "../types/household.types";

// server/src/modules/households/household.routes.ts. Anyone signed in manages their own households; the
// map shows the viewer's own, or everyone's for staff with households.view. Never public.

export async function fetchHouseholdGeoJson(bbox: BBox, within?: string): Promise<ApiResponse<HouseholdFeatureCollection>> {
  const { data } = await httpClient.get<ApiResponse<HouseholdFeatureCollection>>("/api/v1/households/geojson", {
    params: { bbox: bbox.join(","), ...(within ? { within } : {}) },
  });
  return data;
}

/** Households matching `q` (at least 2 characters): the viewer's own, or everyone's for staff. */
export async function searchHouseholds(q: string): Promise<ApiResponse<HouseholdHit[]>> {
  const { data } = await httpClient.get<ApiResponse<HouseholdHit[]>>("/api/v1/households/search", { params: { q } });
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

// Photos of a home: seen by its owner and by staff with households.view; only the owner adds or removes them.
export async function fetchHouseholdPhotos(id: string): Promise<ApiResponse<HouseholdPhoto[]>> {
  const { data } = await httpClient.get<ApiResponse<HouseholdPhoto[]>>(`/api/v1/households/${encodeURIComponent(id)}/photos`);
  return data;
}

/** The photo itself, through the API (it needs the sign-in token), as a blob to show from memory. */
export async function fetchHouseholdPhotoFile(id: string, photoId: string): Promise<Blob> {
  const { data } = await httpClient.get<Blob>(`/api/v1/households/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}/file`, { responseType: "blob" });
  return data;
}

/** Uploads one photo (already shrunk in the browser). A slow connection gets two minutes before it gives up. */
export async function uploadHouseholdPhoto(id: string, photo: Blob): Promise<ApiResponse<HouseholdPhoto>> {
  const form = new FormData();
  form.append("file", photo, "photo.jpg");
  const { data } = await httpClient.post<ApiResponse<HouseholdPhoto>>(`/api/v1/households/${encodeURIComponent(id)}/photos`, form, { timeout: 120_000 });
  return data;
}

export async function deleteHouseholdPhoto(id: string, photoId: string): Promise<ApiResponse<null>> {
  const { data } = await httpClient.delete<ApiResponse<null>>(`/api/v1/households/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}`);
  return data;
}

export async function deleteHousehold(id: string): Promise<ApiResponse<null>> {
  const { data } = await httpClient.delete<ApiResponse<null>>(`/api/v1/households/${encodeURIComponent(id)}`);
  return data;
}

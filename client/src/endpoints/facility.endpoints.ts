import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type { NewPlaceBody, SavedPlace, UpdatePlaceBody } from "../types/map-layer.types";

// server/src/modules/map-layers/map-layer.routes.ts (infrastructureRouter). Administrator-only.

/** Saves a place the OpenStreetMap import didn't capture, e.g. a hospital the administrator visited. */
export async function savePlace(body: NewPlaceBody): Promise<ApiResponse<SavedPlace>> {
  const { data } = await httpClient.post<ApiResponse<SavedPlace>>("/api/v1/infrastructure", body);
  return data;
}

/** Changes the name, kind or note of a place saved this way. Imported facilities are refused (403). */
export async function updatePlace(id: string, body: UpdatePlaceBody): Promise<ApiResponse<SavedPlace>> {
  const { data } = await httpClient.patch<ApiResponse<SavedPlace>>(`/api/v1/infrastructure/${encodeURIComponent(id)}`, body);
  return data;
}

/** Deletes a place saved this way, for good. */
export async function deletePlace(id: string): Promise<ApiResponse<null>> {
  const { data } = await httpClient.delete<ApiResponse<null>>(`/api/v1/infrastructure/${encodeURIComponent(id)}`);
  return data;
}

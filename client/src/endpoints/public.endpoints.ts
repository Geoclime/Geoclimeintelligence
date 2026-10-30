import { httpClient } from "../transport/http";
import type { LocateResult } from "../types/admin-unit.types";
import type { ApiResponse } from "../types/api.types";
import type { PublicArea, PublicOutline, PublicOverview, PublicSearchResults } from "../types/public.types";

// server/src/modules/public/public.routes.ts. No sign-in needed: the landing page calls these.

/** The landing page's counters and data credits. */
export async function fetchPublicOverview(): Promise<ApiResponse<PublicOverview>> {
  const { data } = await httpClient.get<ApiResponse<PublicOverview>>("/api/v1/public/overview");
  return data;
}

/** The LGAs, simplified, for the drawing of the state. */
export async function fetchPublicOutline(): Promise<ApiResponse<PublicOutline>> {
  const { data } = await httpClient.get<ApiResponse<PublicOutline>>("/api/v1/public/outline");
  return data;
}

/** Areas and communities whose names contain `q` (at least 2 characters). */
export async function searchPublicPlaces(q: string): Promise<ApiResponse<PublicSearchResults>> {
  const { data } = await httpClient.get<ApiResponse<PublicSearchResults>>("/api/v1/public/search", { params: { q } });
  return data;
}

/** One area, the areas above it and its rainfall. */
export async function fetchPublicArea(id: string): Promise<ApiResponse<PublicArea>> {
  const { data } = await httpClient.get<ApiResponse<PublicArea>>(`/api/v1/public/areas/${encodeURIComponent(id)}`);
  return data;
}

/** The state, LGA and ward containing a point. Rejects with a 404 ApiError outside every mapped area. */
export async function locatePublicPoint(lon: number, lat: number): Promise<ApiResponse<LocateResult>> {
  const { data } = await httpClient.get<ApiResponse<LocateResult>>("/api/v1/public/locate", { params: { lon, lat } });
  return data;
}

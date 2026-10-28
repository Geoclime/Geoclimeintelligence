import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type {
  ClearMapLayerInput,
  MapLayerClearReport,
  MapLayerInfo,
  MapLayerLoadReport,
  OverlayCollections,
  OverlayLayerId,
  OverlayLayerParams,
  UploadMapLayerInput,
} from "../types/map-layer.types";

// server/src/modules/map-layers/map-layer.routes.ts. Any signed-in user may call the GET routes;
// uploadMapLayer is Administrator-only.

/** Each layer with its size and the sources behind it: what the screen shows as provenance. */
export async function fetchMapLayers(): Promise<ApiResponse<MapLayerInfo[]>> {
  const { data } = await httpClient.get<ApiResponse<MapLayerInfo[]>>("/api/v1/map-layers");
  return data;
}

// bbox is REQUIRED, never optional: the server refuses to hand back shapes without one, and so
// does this function's signature (standard section 6).
export async function fetchLayerGeoJson<L extends OverlayLayerId>(
  layer: L,
  params: OverlayLayerParams,
): Promise<ApiResponse<OverlayCollections[L]>> {
  const { bbox, ...rest } = params;
  const { data } = await httpClient.get<ApiResponse<OverlayCollections[L]>>(`/api/v1/${layer}/geojson`, {
    params: { ...rest, bbox: bbox.join(",") },
  });
  return data;
}

/** Uploads a map-layer file (roads, waterways, settlements or the delivery zip) into PostGIS. */
export async function uploadMapLayer(input: UploadMapLayerInput): Promise<ApiResponse<MapLayerLoadReport>> {
  const form = new FormData();
  form.append("file", input.file, input.file.name);
  form.append("countryCode", input.countryCode);
  form.append("layer", input.layer);
  if (input.sourceId) form.append("sourceId", input.sourceId);
  if (input.wardLevel !== undefined) form.append("wardLevel", String(input.wardLevel));
  const { data } = await httpClient.post<ApiResponse<MapLayerLoadReport>>("/api/v1/map-layers/upload", form, {
    timeout: 180_000,
  });
  return data;
}

/** Clears one or more map layers (roads, waterways, settlements) for a country. */
export async function clearMapLayers(input: ClearMapLayerInput): Promise<ApiResponse<MapLayerClearReport>> {
  const { data } = await httpClient.post<ApiResponse<MapLayerClearReport>>("/api/v1/map-layers/clear", input);
  return data;
}

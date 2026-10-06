import type { BoundaryLayerId } from "../components/map/map-style";

/**
 * Shareable map links: the view, the selected LGA and the visible layers live in the address,
 * e.g. /?lng=7.0134&lat=4.7774&z=11.5&lga=<id>&layers=state,lga,ward, so a copied link opens the
 * same view. Bad or missing values fall back to defaults, never to an error.
 */

export interface MapUrlView {
  longitude: number;
  latitude: number;
  zoom: number;
}

const ALL_LAYERS: BoundaryLayerId[] = ["state", "lga", "ward"];

function num(value: string | null, min: number, max: number): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function readMapView(params: URLSearchParams): MapUrlView | null {
  const longitude = num(params.get("lng"), -180, 180);
  const latitude = num(params.get("lat"), -90, 90);
  const zoom = num(params.get("z"), 0, 22);
  return longitude === null || latitude === null || zoom === null ? null : { longitude, latitude, zoom };
}

export function writeMapView(params: URLSearchParams, view: MapUrlView): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set("lng", view.longitude.toFixed(4));
  next.set("lat", view.latitude.toFixed(4));
  next.set("z", view.zoom.toFixed(1));
  return next;
}

/** Every layer is on unless the link says otherwise; unknown names are ignored. */
export function readLayers(params: URLSearchParams): Record<BoundaryLayerId, boolean> {
  const raw = params.get("layers");
  const listed = raw === null ? ALL_LAYERS : raw.split(",").filter((l): l is BoundaryLayerId => ALL_LAYERS.includes(l as BoundaryLayerId));
  return { state: listed.includes("state"), lga: listed.includes("lga"), ward: listed.includes("ward") };
}

export function writeLayers(params: URLSearchParams, layers: Record<BoundaryLayerId, boolean>): URLSearchParams {
  const next = new URLSearchParams(params);
  const on = ALL_LAYERS.filter((id) => layers[id]);
  if (on.length === ALL_LAYERS.length) next.delete("layers");
  else next.set("layers", on.join(","));
  return next;
}

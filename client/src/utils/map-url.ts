import { BOUNDARY_LAYER_IDS, OVERLAY_LAYER_IDS, SURVEY_LAYER_IDS, type MapLayerId } from "../components/map/map-style";
import type { LonLat } from "../types/admin-unit.types";

/**
 * Shareable map links: the view, the selected LGA and the visible layers live in the address,
 * e.g. /map?lng=7.0134&lat=4.7774&z=11.5&lga=<id>&layers=state,lga,ward, so a copied link opens
 * the same view. Bad or missing values fall back to defaults, never to an error.
 */

/** Where the map lives. It was "/" until the public landing page took that address. */
export const MAP_PATH = "/map";

const MAP_PARAMS = ["lng", "lat", "z", "lga", "layers", "pin"];

/**
 * True for an address that carries map state, i.e. a map link copied before the map moved to
 * /map (they all began "/?lng=..."). The landing page forwards those, so no old link breaks.
 */
export function isMapLink(params: URLSearchParams): boolean {
  return MAP_PARAMS.some((name) => params.has(name));
}

export interface MapUrlView {
  longitude: number;
  latitude: number;
  zoom: number;
}

const ALL_LAYERS: MapLayerId[] = [...BOUNDARY_LAYER_IDS, ...OVERLAY_LAYER_IDS, ...SURVEY_LAYER_IDS];

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

/**
 * One pinned place, e.g. /map?lng=7.0134&lat=4.7774&z=17&pin=7.0134,4.7774: where a flood report
 * was sent from. The map marks it and says which LGA and ward it is in, so a link can point at a
 * single spot rather than just an area.
 */
export function readPin(params: URLSearchParams): LonLat | null {
  const [lng, lat] = (params.get("pin") ?? "").split(",");
  const longitude = num(lng ?? null, -180, 180);
  const latitude = num(lat ?? null, -90, 90);
  return longitude === null || latitude === null ? null : [longitude, latitude];
}

const PIN_LABEL_MAX = 60;

/** What the pin is called ("Flood report"), if the link says; never longer than a label should be. */
export function readPinLabel(params: URLSearchParams): string | null {
  const text = params.get("pinLabel")?.trim().slice(0, PIN_LABEL_MAX);
  return text ? text : null;
}

/** Pins a place, with a short label if there is one; with null the pin and its label are removed. */
export function writePin(params: URLSearchParams, point: LonLat | null, label?: string): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete("pinLabel");
  if (!point) {
    next.delete("pin");
    return next;
  }
  next.set("pin", `${point[0].toFixed(5)},${point[1].toFixed(5)}`);
  const text = label?.trim().slice(0, PIN_LABEL_MAX);
  if (text) next.set("pinLabel", text);
  return next;
}

/** Every layer is on unless the link says otherwise; unknown names are ignored. */
export function readLayers(params: URLSearchParams): Record<MapLayerId, boolean> {
  const raw = params.get("layers");
  const listed = raw === null ? ALL_LAYERS : raw.split(",").filter((l): l is MapLayerId => ALL_LAYERS.includes(l as MapLayerId));
  return Object.fromEntries(ALL_LAYERS.map((id) => [id, listed.includes(id)])) as Record<MapLayerId, boolean>;
}

export function writeLayers(params: URLSearchParams, layers: Record<MapLayerId, boolean>): URLSearchParams {
  const next = new URLSearchParams(params);
  const on = ALL_LAYERS.filter((id) => layers[id]);
  if (on.length === ALL_LAYERS.length) next.delete("layers");
  else next.set("layers", on.join(","));
  return next;
}

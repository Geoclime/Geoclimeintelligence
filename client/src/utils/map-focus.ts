import type { BBox, LonLat } from "../types/admin-unit.types";
import { boundsAround } from "./geo-distance";
import { MAP_PATH, writeMapView, writePin } from "./map-url";

/**
 * Pointing the map at a place someone picked, e.g. from the top bar's search. The address says what
 * a shared link needs (the LGA, or the pin and a view over it); the router state says what the map
 * must do now, because the map page may already be open and a changed address alone never moves it.
 */

export interface MapFocus {
  /** The box to bring into view. */
  bounds: BBox;
  /** A spot to mark and look up (its LGA and ward), with the name it goes by. */
  pin?: { point: LonLat; label: string };
}

export interface MapFocusLink {
  to: string;
  state: { mapFocus: MapFocus };
}

/**
 * Zoom a shared link opens at, and the width of the box the map fits round it. A community is a
 * district (about 1.3 km across), a facility one building (about 450 m).
 */
const COMMUNITY_VIEW = { zoom: 15, span: 0.012 };
const FACILITY_VIEW = { zoom: 17, span: 0.004 };

/** A fresh address for the map. On the map already, the layers the viewer chose are kept; everything else about the old view is dropped. */
function freshParams(current?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  const layers = current?.get("layers");
  if (layers) params.set("layers", layers);
  return params;
}

const withQuery = (params: URLSearchParams) => (params.size > 0 ? `${MAP_PATH}?${params.toString()}` : MAP_PATH);

/** An LGA, ward or state: fit the map to it and highlight the LGA it is (or, for a ward, belongs to). */
export function areaFocusLink(area: { id: string; level: number; parentId: string | null; bbox: BBox }, current?: URLSearchParams): MapFocusLink {
  const params = freshParams(current);
  const lgaId = area.level === 2 ? area.id : area.level > 2 ? area.parentId : null;
  if (lgaId) params.set("lga", lgaId);
  return { to: withQuery(params), state: { mapFocus: { bounds: area.bbox } } };
}

/** A named spot: zoom to it and pin it, so the map says which LGA and ward it is in. */
function pinnedLink(place: { name: string; point: LonLat }, { zoom, span }: typeof COMMUNITY_VIEW, current?: URLSearchParams): MapFocusLink {
  const { point, name } = place;
  const params = writePin(writeMapView(freshParams(current), { longitude: point[0], latitude: point[1], zoom }), point, name);
  return { to: withQuery(params), state: { mapFocus: { bounds: boundsAround([point], span), pin: { point, label: name } } } };
}

/** A named community, pinned, in the district round it. */
export function communityFocusLink(community: { name: string; point: LonLat }, current?: URLSearchParams): MapFocusLink {
  return pinnedLink(community, COMMUNITY_VIEW, current);
}

/** A named facility (a hospital, a school, a place an administrator saved), pinned, close in. */
export function facilityFocusLink(facility: { name: string; point: LonLat }, current?: URLSearchParams): MapFocusLink {
  return pinnedLink(facility, FACILITY_VIEW, current);
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isNumbers = (value: unknown, length: number): value is number[] => Array.isArray(value) && value.length === length && value.every(isNumber);

/** The request in a router location's state, if there is a sound one. History state outlives code changes, so nothing is trusted. */
export function readMapFocus(state: unknown): MapFocus | null {
  const focus = (state as { mapFocus?: Partial<MapFocus> } | null | undefined)?.mapFocus;
  if (!focus || !isNumbers(focus.bounds, 4)) return null;
  const bounds = focus.bounds as BBox;
  const pin = focus.pin;
  if (pin === undefined) return { bounds };
  if (!isNumbers(pin?.point, 2) || typeof pin.label !== "string") return null;
  return { bounds, pin: { point: pin.point as LonLat, label: pin.label } };
}

import { z } from "zod";

/** [minLon, minLat, maxLon, maxLat], EPSG:4326 -- GeoJSON's own bbox order. */
export type BBox = [number, number, number, number];

/** [longitude, latitude] -- GeoJSON's coordinate order (section 4: easy to invert by mistake). */
export type LonLat = [number, number];

export const longitudeSchema = z.coerce.number().min(-180, "Longitude must be between -180 and 180").max(180, "Longitude must be between -180 and 180");
export const latitudeSchema = z.coerce.number().min(-90, "Latitude must be between -90 and 90").max(90, "Latitude must be between -90 and 90");

export function isValidBBox(parts: number[]): parts is BBox {
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return false;
  const [minLon, minLat, maxLon, maxLat] = parts as BBox;
  return minLon >= -180 && maxLon <= 180 && minLat >= -90 && maxLat <= 90 && minLon < maxLon && minLat < maxLat;
}

const BBOX_MESSAGE = "bbox must be minLon,minLat,maxLon,maxLat in EPSG:4326, with min < max";

/** `?bbox=6.4,4.3,7.6,5.7` -> [6.4, 4.3, 7.6, 5.7]. Required on every map-layer route (section 10). */
export const bboxQuerySchema = z
  .string({ error: "bbox is required: map layers are only served for a visible area" })
  .transform((value) => value.split(",").map((part) => Number(part.trim())))
  .refine(isValidBBox, BBOX_MESSAGE)
  .transform((parts) => parts as BBox);

/** The same rule for a bbox sent as a JSON array (e.g. a country's rough box). */
export const bboxArraySchema = z
  .array(z.number())
  .refine(isValidBBox, BBOX_MESSAGE)
  .transform((parts) => parts as BBox);

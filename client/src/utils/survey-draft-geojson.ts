import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { LonLat } from "../types/admin-unit.types";
import type { SurveyTarget } from "../types/field-survey.types";
import { TARGET_INFO } from "./field-survey";

/** What the map draws for a walk in progress: its ring or path, a dot for each point, and where you stand. */
export function surveyDraftGeoJson(target: SurveyTarget | null, points: readonly LonLat[], me: LonLat | null): FeatureCollection {
  const features: Feature<Geometry, { role: string }>[] = [];
  if (target && points.length >= 2) {
    // A flood closes into a ring once it has three corners; until then (and for a drain) it is a path.
    const ring = TARGET_INFO[target].closes && points.length >= 3;
    features.push({
      type: "Feature",
      properties: { role: "shape" },
      geometry: ring ? { type: "Polygon", coordinates: [[...points, points[0]!]] } : { type: "LineString", coordinates: [...points] },
    });
  }
  for (const point of points) features.push({ type: "Feature", properties: { role: "vertex" }, geometry: { type: "Point", coordinates: [...point] } });
  if (me) features.push({ type: "Feature", properties: { role: "me" }, geometry: { type: "Point", coordinates: [...me] } });
  return { type: "FeatureCollection", features };
}

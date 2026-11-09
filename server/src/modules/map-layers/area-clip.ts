/**
 * SQL pieces that cut a map layer to one LGA or ward, for the small map on a place's page: only what
 * lies inside the place is drawn there, as with its flood risk picture. `n` is the query parameter
 * holding the admin unit's id; when it is null, nothing is cut and the layer is served as usual.
 * The cutting runs in PostGIS (backend standard section 8). Each layer's query uses these the same way.
 */

/** The `area` CTE: the outline of admin unit `$n`, or no row when `$n` is null. */
export const areaCte = (n: number) => `area AS (SELECT au.geom FROM admin_units au WHERE au.id = $${n}::uuid)`;

/** True for a feature that reaches into the area, and always when no area was asked for. */
export const reachesArea = (geom: string, n: number) =>
  `($${n}::uuid IS NULL OR EXISTS (SELECT 1 FROM area a WHERE ${geom} && a.geom AND ST_Intersects(${geom}, a.geom)))`;

/**
 * A line cut at the area's outline: left whole when it lies inside (the common case, and much cheaper),
 * or when no area was asked for. Only the line parts of the cut are kept, never a stray point where a
 * line touches the edge.
 */
export const lineInArea = (shape: string, n: number) =>
  `CASE WHEN $${n}::uuid IS NULL THEN ${shape} ELSE (SELECT CASE WHEN ST_CoveredBy(${shape}, a.geom) THEN ${shape} ` +
  `ELSE ST_CollectionExtract(ST_Intersection(${shape}, a.geom), 2) END FROM area a) END`;

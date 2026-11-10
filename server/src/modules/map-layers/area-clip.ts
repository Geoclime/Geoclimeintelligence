/**
 * SQL pieces that cut a map layer to one LGA or ward, for the small map on a place's page: only what
 * lies inside the place is drawn there, as with its flood risk picture. `n` is the query parameter
 * holding the admin unit's id; when it is null, nothing is cut and the layer is served as usual.
 * The cutting runs in PostGIS (backend standard section 8). Each layer's query uses these the same way.
 */

/**
 * The `area` CTE: the outline of admin unit `$n`, or no row when `$n` is null. Repaired first
 * (ST_MakeValid): an imported boundary with a small flaw would otherwise make the cut fail with a
 * topology error, and the whole layer with it.
 */
export const areaCte = (n: number) => `area AS (SELECT ST_MakeValid(au.geom) AS geom FROM admin_units au WHERE au.id = $${n}::uuid)`;

/** True for a feature that reaches into the area, and always when no area was asked for. */
export const reachesArea = (geom: string, n: number) =>
  `($${n}::uuid IS NULL OR EXISTS (SELECT 1 FROM area a WHERE ${geom} && a.geom AND ST_Intersects(${geom}, a.geom)))`;

/**
 * A feature cut at the area's outline: left whole when it lies inside (the common case, and much cheaper),
 * or when no area was asked for. A line keeps its line parts and a polygon (a wide river, a water body)
 * its polygon parts: only the kind of shape it was is kept, never a stray point where it touches the edge.
 */
export const shapeInArea = (shape: string, n: number) =>
  `CASE WHEN $${n}::uuid IS NULL THEN ${shape} ELSE (SELECT CASE WHEN ST_CoveredBy(${shape}, a.geom) THEN ${shape} ` +
  `ELSE ST_CollectionExtract(ST_Intersection(${shape}, a.geom), ST_Dimension(${shape}) + 1) END FROM area a) END`;

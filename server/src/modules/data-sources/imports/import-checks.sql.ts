/**
 * The shape checks, run in PostGIS on a run's staging rows (section 8: spatial work happens in
 * the database). Each statement handles one rule, in order; $1 is the run id. A failed check
 * appends a plain-language error to the row. Only "missing" and "unreadable" checks clear the
 * shape: a shape that is merely in the wrong place is kept, so the review map can show it in red.
 *
 * withBBox statements also take $2 = country code and $3 = the country's bbox (float8[4] or NULL).
 */
export interface GeometryCheck {
  sql: string;
  withBBox?: boolean;
}

export const GEOMETRY_CHECKS: readonly GeometryCheck[] = [
  // 1. Read the text (WKT or GeoJSON). import_parse_geometry returns NULL instead of throwing.
  { sql: `UPDATE import_staging_rows SET geom = import_parse_geometry(geom_source, geom_format)
    WHERE run_id = $1 AND geom_source IS NOT NULL` },
  { sql: `UPDATE import_staging_rows SET errors = errors || 'The shape is missing'::text
    WHERE run_id = $1 AND geom_source IS NULL` },
  { sql: `UPDATE import_staging_rows
      SET errors = errors || ('The shape could not be read as ' || CASE geom_format WHEN 'geojson' THEN 'GeoJSON' ELSE 'WKT' END)
    WHERE run_id = $1 AND geom_source IS NOT NULL AND geom IS NULL` },

  // 2. EPSG:4326 only. Plain WKT carries no SRID and is taken as 4326, as the template says.
  { sql: `UPDATE import_staging_rows
      SET errors = errors || format('The shape is in SRID %s; only EPSG:4326 (WGS84) is accepted', ST_SRID(geom)), geom = NULL
    WHERE run_id = $1 AND geom IS NOT NULL AND ST_SRID(geom) NOT IN (0, 4326)` },
  { sql: `UPDATE import_staging_rows SET geom = ST_SetSRID(geom, 4326)
    WHERE run_id = $1 AND geom IS NOT NULL AND ST_SRID(geom) = 0` },

  // 3. Areas only.
  { sql: `UPDATE import_staging_rows
      SET errors = errors || format('The shape must be a Polygon or MultiPolygon, not a %s', GeometryType(geom)), geom = NULL
    WHERE run_id = $1 AND geom IS NOT NULL AND GeometryType(geom) NOT IN ('POLYGON', 'MULTIPOLYGON')` },

  // 4. Real coordinates (catches values that are not degrees at all, e.g. a projected CRS in metres).
  { sql: `UPDATE import_staging_rows
      SET errors = errors || 'The shape has coordinates outside longitude -180 to 180 or latitude -90 to 90'::text, geom = NULL
    WHERE run_id = $1 AND geom IS NOT NULL
      AND (ST_XMin(geom) < -180 OR ST_XMax(geom) > 180 OR ST_YMin(geom) < -90 OR ST_YMax(geom) > 90)` },

  // 5. Valid shapes: repair with ST_MakeValid, keep only the polygon parts, and say so.
  { sql: `UPDATE import_staging_rows
      SET warnings = warnings || ('The shape was repaired with ST_MakeValid (' || ST_IsValidReason(geom) || ')'),
          geom = ST_CollectionExtract(ST_MakeValid(geom), 3)
    WHERE run_id = $1 AND geom IS NOT NULL AND NOT ST_IsValid(geom)` },
  { sql: `UPDATE import_staging_rows SET errors = errors || 'The shape is empty'::text, geom = NULL
    WHERE run_id = $1 AND geom IS NOT NULL AND ST_IsEmpty(geom)` },

  // 6. Every Polygon becomes a MultiPolygon, so every row has the same type.
  { sql: `UPDATE import_staging_rows SET geom = ST_Multi(geom)
    WHERE run_id = $1 AND geom IS NOT NULL AND GeometryType(geom) = 'POLYGON'` },

  // 7. Inside the country's rough box (skipped when the country has none).
  { sql: `UPDATE import_staging_rows
      SET errors = errors || format('The shape lies outside %s''s bounding box. Check its coordinates: a typo, a missing minus sign, or a shape from another country?', $2::text)
    WHERE run_id = $1 AND geom IS NOT NULL AND $3::float8[] IS NOT NULL
      AND NOT ST_Within(geom, ST_MakeEnvelope(($3::float8[])[1], ($3::float8[])[2], ($3::float8[])[3], ($3::float8[])[4], 4326))`,
    withBBox: true },

  // 8. A warning, not an error: different sources' boundaries rarely nest exactly, but an area
  //    whose middle isn't inside its parent at all is worth a look on the map.
  { sql: `UPDATE import_staging_rows s
      SET warnings = s.warnings || format('The shape''s middle is not inside its parent %s', au.unit_name)
     FROM admin_units au
    WHERE s.run_id = $1 AND s.geom IS NOT NULL
      AND au.id = (s.fields->>'parentId')::uuid
      AND NOT ST_Intersects(au.geom, ST_PointOnSurface(s.geom))` },

  // 9. The verdict.
  { sql: `UPDATE import_staging_rows SET status = CASE WHEN cardinality(errors) = 0 THEN 'passed' ELSE 'failed' END
    WHERE run_id = $1` },
  { sql: `UPDATE import_runs r SET row_count = c.total, passed_count = c.passed, error_count = c.failed
     FROM (SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE status = 'passed')::int AS passed,
                  count(*) FILTER (WHERE status = 'failed')::int AS failed
             FROM import_staging_rows WHERE run_id = $1) c
    WHERE r.id = $1` },
];

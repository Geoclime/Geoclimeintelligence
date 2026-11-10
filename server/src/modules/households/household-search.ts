import { likePatterns, normSql, searchWords } from "../../common/search/search-terms";
import type { BuiltSearch } from "../map-layers/facility-search";

/**
 * The query behind the "Households" results in the top bar's search: households where every word of the
 * search is found in the name, the note, the kind of home, or the ward and LGA (and, for staff, the owner's
 * name). Staff with households.view (`all`) search everyone's; anyone else only their own, so a household is
 * never listed to someone who may not see it. Their own come first, then names that start with the search.
 * Null when the search has no usable word. Only fixed text is put in the SQL; every word travels as a parameter.
 */
export function householdSearchQuery(q: string, viewerId: string, all: boolean, limit: number): BuiltSearch | null {
  const words = searchWords(q);
  if (words.length === 0) return null;

  const params: unknown[] = [viewerId, all];
  const add = (value: unknown) => params.push(value);

  const text = normSql(`concat_ws(' ', h.label, h.note, h.home_type, w.unit_name, l.unit_name${all ? ", u.display_name" : ""})`);
  const everyWord = words
    .map((word) => {
      add(likePatterns(word));
      return `${text} LIKE ANY($${params.length}::text[])`;
    })
    .join(" AND ");
  add(`${words.join(" ")}%`);
  const full = `$${params.length}`;
  add(limit);
  const limitParam = `$${params.length}::int`;

  const sql = `
    SELECT h.id, h.label, h.home_type AS "homeType", (h.owner_id = $1::uuid) AS mine,
           ${all ? "u.display_name" : "NULL::varchar"} AS "ownerName",
           NULLIF(concat_ws(', ', w.unit_name, l.unit_name), '') AS area,
           ARRAY[round(ST_X(h.geom)::numeric, 6)::float8, round(ST_Y(h.geom)::numeric, 6)::float8] AS point
      FROM households h
      LEFT JOIN admin_units w ON w.id = h.ward_id
      LEFT JOIN admin_units l ON l.id = h.lga_id
      ${all ? "LEFT JOIN users u ON u.id = h.owner_id" : ""}
     WHERE ($2::boolean OR h.owner_id = $1::uuid) AND ${everyWord}
     ORDER BY (h.owner_id = $1::uuid) DESC, (${normSql("h.label")} LIKE ${full}) DESC, h.label, h.id
     LIMIT ${limitParam}`;
  return { sql, params };
}

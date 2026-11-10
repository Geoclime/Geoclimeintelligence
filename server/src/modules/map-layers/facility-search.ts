import { likePatterns, normSql, searchWords } from "../../common/search/search-terms";
import { FACILITY_TYPES } from "./layer-rules";

/**
 * Words people use for a kind of place that its stored class doesn't say, each with the classes (LIKE
 * patterns) it means: "church" is the Geofabrik class "christian" (or "christian_anglican"...), "jetty"
 * a ferry terminal, "home" a residence. A kind named in its own words ("hospital", "pharmacy", "office")
 * needs no entry: the class name itself is searched.
 */
const KIND_WORDS: Readonly<Record<string, readonly string[]>> = {
  church: ["christian%"],
  mosque: ["muslim%"],
  temple: ["hindu%", "buddhist%", "sikh%", "taoist%", "shintoist%"],
  worship: ["christian%", "muslim%", "jewish%", "hindu%", "buddhist%", "sikh%", "taoist%", "shintoist%"],
  market: ["marketplace", "mall"],
  home: ["residence", "apartments"],
  house: ["residence", "apartments"],
  compound: ["residence"],
  flat: ["apartments"],
  residential: ["residence", "apartments"],
  company: ["private_firm"],
  nursery: ["kindergarten"],
  jetty: ["ferry_terminal"],
  borehole: ["water_well", "drinking_water"],
  mast: ["comms_tower"],
  council: ["town_hall"],
  drugstore: ["pharmacy", "chemist"],
  train: ["railway_station"],
  airstrip: ["airfield"],
};

/** The class patterns a word stands for: its entry above, for the word or its singular. */
function classPatterns(word: string): string[] {
  const singular = word.length > 3 ? word.replace(/(?:es|s)$/, "") : word;
  return [...new Set([...(KIND_WORDS[word] ?? []), ...(KIND_WORDS[singular] ?? [])])];
}

export interface BuiltSearch {
  sql: string;
  params: unknown[];
}

/**
 * The query behind the top bar's search for places: named facilities where every word of the search is
 * found in the name, the kind of place (so "hospital" finds hospitals whatever they are called), the note
 * or the ward and LGA it is in. At least one word must be in the name or the kind, so naming a ward alone
 * doesn't list everything in it. Names that start with the search come first, then names with the most of
 * its words, then health before the rest (FACILITY_TYPES order). Null when the search has no usable word.
 * Only fixed text is put in the SQL; every word travels as a parameter.
 */
export function facilitySearchQuery(q: string, limit: number): BuiltSearch | null {
  const words = searchWords(q);
  if (words.length === 0) return null;

  const params: unknown[] = [];
  const add = (value: unknown) => params.push(value);

  const perWord = words.map((word) => {
    add(likePatterns(word));
    const likes = `$${params.length}::text[]`;
    add(classPatterns(word));
    const classes = `$${params.length}::text[]`;
    return { likes, classes };
  });
  add(`${words.join(" ")}%`);
  const full = `$${params.length}`;
  add([...FACILITY_TYPES]);
  const typeOrder = `$${params.length}::text[]`;
  add(limit);
  const limitParam = `$${params.length}::int`;

  const everyWord = perWord
    .map(({ likes, classes }) => `(h.name_n LIKE ANY(${likes}) OR h.kind_n LIKE ANY(${likes}) OR h.area_n LIKE ANY(${likes}) OR h.note_n LIKE ANY(${likes}) OR h.osm_class LIKE ANY(${classes}))`)
    .join(" AND ");
  const someWordDirect = perWord.map(({ likes, classes }) => `(h.name_n LIKE ANY(${likes}) OR h.kind_n LIKE ANY(${likes}) OR h.osm_class LIKE ANY(${classes}))`).join(" OR ");
  const wordsInName = perWord.map(({ likes }) => `(CASE WHEN h.name_n LIKE ANY(${likes}) THEN 1 ELSE 0 END)`).join(" + ");

  const sql = `
    SELECT h.id, h.name, h.facility_type AS "facilityType", h.osm_class AS "osmClass", h.origin, h.point, h.area
      FROM (
        SELECT f.id, f.name, f.facility_type, f.osm_class, f.origin,
               ARRAY[round(ST_X(f.geom)::numeric, 6)::float8, round(ST_Y(f.geom)::numeric, 6)::float8] AS point,
               NULLIF(concat_ws(', ', w.unit_name, l.unit_name), '') AS area,
               ${normSql("f.name")} AS name_n,
               ${normSql("concat_ws(' ', f.osm_class, f.facility_type)")} AS kind_n,
               ${normSql("concat_ws(' ', w.unit_name, l.unit_name)")} AS area_n,
               ${normSql("coalesce(f.note, '')")} AS note_n
          FROM infrastructure f
          LEFT JOIN admin_units w ON w.id = f.admin_unit_id
          LEFT JOIN admin_units l ON l.id = w.parent_id
         WHERE f.name IS NOT NULL) h
     WHERE ${everyWord} AND (${someWordDirect})
     ORDER BY (h.name_n LIKE ${full}) DESC, (${wordsInName}) DESC, array_position(${typeOrder}, h.facility_type::text), h.name, h.id
     LIMIT ${limitParam}`;
  return { sql, params };
}

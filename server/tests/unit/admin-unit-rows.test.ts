import { describe, expect, it } from "vitest";
import { matchKey, nameKey } from "../../src/modules/admin-units/name-standards";
import { prepareAdminUnitRows, type AdminUnitRowContext } from "../../src/modules/data-sources/imports/admin-unit-rows";
import { assertMappingFits, suggestMapping } from "../../src/modules/data-sources/imports/column-mapping";
import type { ParsedFile } from "../../src/modules/data-sources/imports/import.types";
import { makeUnit } from "../geo-fakes";

const rivers = makeUnit({ level: 1, levelName: "State", unitName: "Rivers", unitCode: "NG-RI" });
const obioAkpor = makeUnit({ unitName: "Obio-Akpor", unitCode: "NG033015", parentId: rivers.id });
const emohua = makeUnit({ unitName: "Emohua", unitCode: "NG033010", parentId: rivers.id });

function xlsx(rows: Record<string, string | null>[]): ParsedFile {
  return {
    fileType: "xlsx",
    sheets: ["Areas"],
    sheetName: "Areas",
    headerRow: 1,
    headings: Object.keys(rows[0] ?? {}),
    rows: rows.map((values, i) => ({ rowNumber: i + 2, values, geometry: null })),
  };
}

const lgaContext: AdminUnitRowContext = {
  countryCode: "NGA",
  level: 2,
  levelName: "LGA",
  parentLevelName: "State",
  fixedParent: null,
  parents: [rivers],
  existing: [],
};
const lgaMapping = { unit_name: "name", unit_code: "code", parent_code: "state", geometry_wkt: "wkt" };

describe("name keys", () => {
  it("ignore case, accents and punctuation, and fold known spelling variants", () => {
    expect(nameKey("Obio/Akpor")).toBe(nameKey("obio-akpor"));
    expect(matchKey("Emuoha", "NGA")).toBe(matchKey("Emohua", "NGA"));
    expect(matchKey("Rivers State", "NGA")).toBe(matchKey("Rivers", "NGA"));
  });
});

describe("prepareAdminUnitRows", () => {
  it("standardises source spellings to the standard LGA list, with a warning", () => {
    const [emuoha, omumma, obia] = prepareAdminUnitRows(
      xlsx([
        { name: "Emuoha", code: "NG033010", state: "Rivers", wkt: "POLYGON((...))" },
        { name: "Omumma", code: "NG033019", state: "NG-RI", wkt: "POLYGON((...))" },
        { name: "Obia/Akpor", code: "NG033015", state: "Rivers State", wkt: "POLYGON((...))" },
      ]),
      lgaMapping,
      lgaContext,
    );
    expect(emuoha).toMatchObject({ errors: [], fields: { unitName: "Emohua", parentId: rivers.id } });
    expect(emuoha!.warnings).toEqual(['Name standardised from "Emuoha" to "Emohua"']);
    expect(omumma!.fields.unitName).toBe("Omuma");
    expect(obia!.fields.unitName).toBe("Obio-Akpor");
  });

  it("refuses a name that isn't one of the 23 LGAs", () => {
    const [row] = prepareAdminUnitRows(xlsx([{ name: "Lagos Island", code: null, state: "Rivers", wkt: "x" }]), lgaMapping, lgaContext);
    expect(row!.errors).toEqual(['"Lagos Island" is not one of the 23 standard Rivers State LGA names']);
  });

  it("keeps the raw row untouched, minus the shape, which is stored separately", () => {
    const [row] = prepareAdminUnitRows(xlsx([{ name: "Okrika", code: "NG033018", state: "Rivers", wkt: "POLYGON((1 1))" }]), lgaMapping, lgaContext);
    expect(row).toMatchObject({ geomSource: "POLYGON((1 1))", geomFormat: "wkt", raw: { name: "Okrika", code: "NG033018", state: "Rivers" } });
    expect(row!.raw).not.toHaveProperty("wkt");
  });

  it("reports missing names, missing parents and unknown parents", () => {
    const rows = prepareAdminUnitRows(
      xlsx([
        { name: null, code: null, state: "Rivers", wkt: "x" },
        { name: "Bonny", code: null, state: null, wkt: "x" },
        { name: "Bonny", code: null, state: "Lagos", wkt: "x" },
      ]),
      lgaMapping,
      lgaContext,
    );
    expect(rows[0]!.errors).toContain("The name is missing");
    expect(rows[1]!.errors).toContain("The parent State is missing");
    expect(rows[2]!.errors).toContain('No State called or coded "Lagos" exists yet');
  });

  it("catches duplicates in the file and against the live table", () => {
    const rows = prepareAdminUnitRows(
      xlsx([
        { name: "Bonny", code: "NG033007", state: "Rivers", wkt: "x" },
        { name: "BONNY", code: "NG033007", state: "Rivers", wkt: "x" },
        { name: "Eleme", code: "NG033009", state: "Rivers", wkt: "x" },
      ]),
      lgaMapping,
      { ...lgaContext, existing: [makeUnit({ unitName: "Eleme", unitCode: "NG033009", parentId: rivers.id })] },
    );
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[1]!.errors).toEqual(["Same name and parent as row 2", "Same code as row 2"]);
    expect(rows[2]!.errors).toEqual([
      '"Eleme" already exists under this parent; it can\'t be imported twice',
      'Code "NG033009" is already used by a live LGA',
    ]);
  });

  it("matches the wards file's LGA spellings to the standard LGA names", () => {
    const wards: ParsedFile = {
      fileType: "geojson",
      sheets: [],
      sheetName: null,
      headerRow: null,
      headings: ["wardname", "wardcode", "lganame"],
      rows: [
        { rowNumber: 1, values: { wardname: "Rumuodara", wardcode: "RVSBAK01", lganame: "Obio/Akpor" }, geometry: '{"type":"Polygon"}' },
        { rowNumber: 2, values: { wardname: "Omward 5", wardcode: "RVSBER05", lganame: "Emuoha" }, geometry: null },
      ],
    };
    const rows = prepareAdminUnitRows(
      wards,
      { unit_name: "wardname", unit_code: "wardcode", parent_code: "lganame" },
      { ...lgaContext, level: 3, levelName: "Ward", parentLevelName: "LGA", parents: [obioAkpor, emohua] },
    );
    expect(rows[0]).toMatchObject({ errors: [], geomFormat: "geojson", fields: { parentId: obioAkpor.id, parentName: "Obio-Akpor" } });
    // A missing shape is left for the database checks to report; the parent still matched.
    expect(rows[1]).toMatchObject({ geomSource: null, fields: { parentId: emohua.id } });
  });
});

describe("column mapping", () => {
  it("guesses the real Phase 2 files' columns", () => {
    expect(
      suggestMapping(
        ["lga_name_standard", "lga_name_source_geoboundaries", "state", "adm2_pcode", "shape_id", "geometry_wkt (EPSG:4326)"],
        { fileType: "xlsx", needsParentColumn: true },
      ),
    ).toEqual({ unit_name: "lga_name_standard", unit_code: "adm2_pcode", parent_code: "state", geometry_wkt: "geometry_wkt (EPSG:4326)" });

    expect(
      suggestMapping(["FID", "wardname", "wardcode", "lganame", "lgacode", "statename", "amapcode"], {
        fileType: "geojson",
        needsParentColumn: true,
      }),
    ).toEqual({ unit_name: "wardname", unit_code: "wardcode", parent_code: "lganame" });

    expect(
      suggestMapping(["shapeName", "shapeISO", "shapeID", "shapeGroup"], { fileType: "geojson", needsParentColumn: false }),
    ).toEqual({ unit_name: "shapeName", unit_code: "shapeISO" });
  });

  it("refuses a mapping that misses a required column or names one the file lacks", () => {
    expect(() =>
      assertMappingFits({ unit_name: "name", geometry_wkt: "nope" }, ["name", "wkt"], { fileType: "xlsx", needsParentColumn: true }),
    ).toThrow(expect.objectContaining({ errors: expect.arrayContaining([
      expect.objectContaining({ field: "columnMapping.parent_code" }),
      expect.objectContaining({ field: "columnMapping.geometry_wkt", message: 'The file has no column called "nope"' }),
    ]) }));
  });
});

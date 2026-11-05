import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/common/errors/app-error";
import { assertRainfallMappingFits, suggestRainfallMapping } from "../../src/modules/data-sources/imports/column-mapping";
import type { ParsedFile } from "../../src/modules/data-sources/imports/import.types";
import {
  parseYearMonth,
  prepareRainfallRows,
  summariseRainfallRows,
  type RainfallRowContext,
} from "../../src/modules/data-sources/imports/rainfall-rows";
import { readXlsx } from "../../src/modules/data-sources/imports/readers/xlsx-reader";
import { makeUnit } from "../geo-fakes";

const rivers = makeUnit({ level: 1, levelName: "State", unitName: "Rivers", unitCode: "NG-RI" });
const obioAkpor = makeUnit({ unitName: "Obio-Akpor", unitCode: "NG033015", parentId: rivers.id });
const portHarcourt = makeUnit({ unitName: "Port Harcourt", unitCode: "NG033022", parentId: rivers.id });
const omuma = makeUnit({ unitName: "Omuma", unitCode: "NG033019", parentId: rivers.id });

/** The headings of CHIRPS as exported from Earth Engine (CHIRPS_rain_csv_Rivers_2016_2026_combined.xlsx). */
const CHIRPS_HEADINGS = [
  "system:index", "ADM0_EN", "ADM0_PCODE", "ADM1_EN", "ADM1_PCODE", "ADM2ALT1EN", "ADM2ALT2EN", "ADM2_EN", "ADM2_PCODE",
  "ADM2_REF", "SD_EN", "SD_PCODE", "Shape_Area", "Shape_Leng", "date", "mean", "validOn", "year_month", ".geo",
];
const chirpsMapping = { area_code: "ADM2_PCODE", area_name: "ADM2_EN", year_month: "year_month", rainfall_mm: "mean" };

function chirps(rows: Record<string, string | null>[]): ParsedFile {
  return {
    fileType: "xlsx",
    sheets: ["CHIRPS_rain_csv_Rivers_2016_202"],
    sheetName: "CHIRPS_rain_csv_Rivers_2016_202",
    headerRow: 1,
    headings: ["ADM2_EN", "ADM2_PCODE", "year_month", "mean", ".geo"],
    rows: rows.map((values, i) => ({ rowNumber: i + 2, values: { ".geo": '{"type":"Polygon"}', ...values }, geometry: null })),
    warnings: [],
  };
}

const row = (name: string | null, code: string | null, month: string | null, mean: string | null) => ({
  ADM2_EN: name,
  ADM2_PCODE: code,
  year_month: month,
  mean,
});

/** The first field-level error a call threw, or undefined if it didn't throw one. */
function fieldError(call: () => unknown): { field?: string; message: string } | undefined {
  try {
    call();
  } catch (err) {
    return (err as ValidationError).errors?.[0];
  }
  return undefined;
}

function context(overrides: Partial<RainfallRowContext> = {}): RainfallRowContext {
  return { countryCode: "NGA", levelName: "LGA", areas: [obioAkpor, portHarcourt, omuma], live: [], currentMonth: "2026-10", ...overrides };
}

describe("parseYearMonth", () => {
  it("reads a month however the file writes it", () => {
    expect(parseYearMonth("2016-01")).toBe("2016-01");
    expect(parseYearMonth("2016-1")).toBe("2016-01");
    expect(parseYearMonth("2016/09")).toBe("2016-09");
    expect(parseYearMonth("2016-01-01")).toBe("2016-01");
    expect(parseYearMonth("2016-01-01T00:00:00.000Z")).toBe("2016-01");
  });

  it("refuses what isn't a month", () => {
    expect(parseYearMonth("2016-13")).toBeNull();
    expect(parseYearMonth("Jan 2016")).toBeNull();
    expect(parseYearMonth("1480406400000")).toBeNull();
  });
});

describe("rainfall column guesses", () => {
  it("match the CHIRPS export, picking ADM2 (not ADM0 or ADM1) for LGAs", () => {
    expect(suggestRainfallMapping(CHIRPS_HEADINGS, 2)).toEqual(chirpsMapping);
  });

  it("match the cleaned rainfall sheet", () => {
    const headings = ["lga_name_standard", "lga_name_source", "adm2_pcode", "senatorial_district", "year_month", "mean_rainfall_mm", "status"];
    expect(suggestRainfallMapping(headings, 2)).toEqual({
      area_code: "adm2_pcode",
      area_name: "lga_name_standard",
      year_month: "year_month",
      rainfall_mm: "mean_rainfall_mm",
    });
  });

  it("need a month, a value, and the area's code or name", () => {
    expect(() => assertRainfallMappingFits({ area_name: "ADM2_EN", year_month: "year_month", rainfall_mm: "mean" }, CHIRPS_HEADINGS)).not.toThrow();
    expect(() => assertRainfallMappingFits({ year_month: "year_month", rainfall_mm: "mean" }, CHIRPS_HEADINGS)).toThrow();
    expect(() => assertRainfallMappingFits({ area_code: "ADM2_PCODE", rainfall_mm: "nope" }, CHIRPS_HEADINGS)).toThrow();
  });
});

describe("prepareRainfallRows", () => {
  it("matches areas by code, and by name when the code is unknown, with the source's spellings", () => {
    const [byCode, byName, omumma] = prepareRainfallRows(
      chirps([
        row("Obia/Akpor", "NG033015", "2016-01-01", "15.719154818319"),
        row("Port-Harcourt", "NG999999", "2016-01-01", "20"),
        row("Omumma", null, "2016-01-01", "0"),
      ]),
      chirpsMapping,
      context(),
    );
    expect(byCode).toMatchObject({ errors: [], warnings: [], fields: { adminUnitId: obioAkpor.id, unitName: "Obio-Akpor", yearMonth: "2016-01", rainfallMm: 15.719, change: "new" } });
    expect(byName!.fields.adminUnitId).toBe(portHarcourt.id);
    expect(byName!.warnings).toEqual([`Code "NG999999" isn't a live LGA's code; matched by name to Port Harcourt`]);
    expect(omumma).toMatchObject({ errors: [], fields: { adminUnitId: omuma.id, rainfallMm: 0 } });
  });

  it("leaves the outline column out of the stored raw row, and keeps every other value as read", () => {
    const [staged] = prepareRainfallRows(chirps([row("Omumma", "NG033019", "2016-01-01", "5")]), chirpsMapping, context());
    expect(staged!.raw).toEqual({ ADM2_EN: "Omumma", ADM2_PCODE: "NG033019", year_month: "2016-01-01", mean: "5" });
    expect(staged!.geomSource).toBeNull();
  });

  it("fails rows with an unknown area, a bad or future month, or a value that isn't plausible rainfall", () => {
    const rows = prepareRainfallRows(
      chirps([
        row("Lagos Island", "NG025001", "2016-01", "5"),
        row(null, "NG033015", "January", "5"),
        row(null, "NG033015", "2026-11", "5"),
        row(null, "NG033015", "2016-02", "-1"),
        row(null, "NG033015", "2016-03", "12,5"),
        row(null, "NG033015", "2016-04", "25000"),
        row(null, null, "2016-05", "5"),
      ]),
      chirpsMapping,
      context(),
    );
    expect(rows.map((r) => r.errors)).toEqual([
      ['No live LGA has the code "NG025001" or the name "Lagos Island"'],
      ['"January" is not a month; use YYYY-MM, e.g. 2016-01'],
      ["2026-11 is in the future"],
      ["The rainfall is negative"],
      ['The rainfall "12,5" is not a number'],
      ["25000 mm in one month is more than the world record; check the units"],
      ["The LGA code and name are both missing"],
    ]);
  });

  it("refuses the whole file when two rows are for the same area and month, so neither value goes in", () => {
    const read = () =>
      prepareRainfallRows(chirps([row(null, "NG033015", "2016-01", "5"), row("Obio-Akpor", null, "2016-01-01", "6")]), chirpsMapping, context());
    expect(read).toThrow(ValidationError);
    expect(fieldError(read)).toMatchObject({
      field: "level",
      message: expect.stringMatching(/^1 rows have the same LGA and month as an earlier row \(first: row 3 repeats row 2, Obio-Akpor 2016-01\)/),
    });
  });

  it("refuses CHIRPS per LGA read as per State, where every LGA's row matches the one state", () => {
    const state = makeUnit({ level: 1, levelName: "State", unitName: "Rivers", unitCode: "NG-RI" });
    const perLga = chirps([row("Rivers", "NG033", "2016-01", "15.7"), row("Rivers", "NG033", "2016-01", "16.0")]);
    const read = () => prepareRainfallRows(perLga, chirpsMapping, context({ levelName: "State", areas: [state] }));
    expect(fieldError(read)?.message).toMatch(/smaller areas than States, choose that level instead/);
  });

  it("warns, without failing, when the name disagrees with the code it matched", () => {
    const [staged] = prepareRainfallRows(chirps([row("Okrika", "NG033015", "2016-01", "5")]), chirpsMapping, context());
    expect(staged!.errors).toEqual([]);
    expect(staged!.warnings).toEqual(['The name "Okrika" doesn\'t match Obio-Akpor, the LGA with code NG033015; matched by code']);
  });

  it("compares each month with what is live: new, filled in, revised, unchanged", () => {
    const live = [
      { adminUnitId: obioAkpor.id, yearMonth: "2026-08", rainfallMm: 304.5 },
      { adminUnitId: obioAkpor.id, yearMonth: "2026-09", rainfallMm: null },
      { adminUnitId: portHarcourt.id, yearMonth: "2026-08", rainfallMm: 310 },
      { adminUnitId: portHarcourt.id, yearMonth: "2026-09", rainfallMm: 280.25 },
    ];
    const rows = prepareRainfallRows(
      chirps([
        row(null, "NG033015", "2026-08", "304.5001"), // same once rounded to 3 decimals
        row(null, "NG033015", "2026-09", "382.1"), // was incomplete
        row(null, "NG033022", "2026-08", "312"), // different value
        row(null, "NG033022", "2026-09", null), // the file has no value; the live one stays
        row(null, "NG033019", "2026-09", null), // new, incomplete
      ]),
      chirpsMapping,
      context({ live }),
    );
    expect(rows.map((r) => r.fields.change)).toEqual(["unchanged", "filled", "revised", "unchanged", "new"]);
    expect(rows.map((r) => r.errors)).toEqual([[], [], [], [], []]);
    expect(rows[1]!.warnings).toEqual(["Fills in 2026-09, which is live as an incomplete month"]);
    expect(rows[2]!.warnings).toEqual(["Replaces the live value for 2026-08: 310 mm becomes 312 mm"]);
    expect(rows[3]!.warnings).toEqual(["No rainfall value in the file; the live value of 280.25 mm is kept"]);
    expect(rows[4]!.warnings).toEqual(["No rainfall value: 2026-09 is stored as an incomplete month"]);
    expect(rows[2]!.fields).toMatchObject({ liveExists: true, liveRainfallMm: 310 });
    expect(rows[4]!.fields).toMatchObject({ liveExists: false, liveRainfallMm: null, rainfallMm: null });

    expect(summariseRainfallRows(rows, [".geo"], "LGA")).toEqual([
      '".geo" holds each area\'s outline and was not stored: the rainfall attaches to the live LGA boundaries instead.',
      "2 months are already live with the same value, so they are left as they are. That's expected when a file repeats earlier months.",
      "1 months already live have a different value in this file. Promoting replaces them; each one says so in its row.",
      "1 months that were live as incomplete get their value from this file.",
      "1 rows have no rainfall value (an incomplete month, usually the latest). They are stored without a value, and a later file fills them in.",
    ]);
  });
});

describe("readXlsx and dates", () => {
  /** Laid out like the CHIRPS export: year_month is an Excel date cell, formatted yyyy-mm. */
  async function chirpsWorkbook(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("lga_boundaries").addRow(["lga_name_standard", "geometry_wkt"]);
    const sheet = workbook.addWorksheet("CHIRPS_rain_csv_Rivers_2016_202");
    sheet.addRow(["ADM2_EN", "ADM2_PCODE", "mean", "year_month"]);
    sheet.addRow(["Emohua", "NG033010", 15.719154818319, new Date(Date.UTC(2016, 0, 1))]);
    sheet.addRow(["Emohua", "NG033010", null, new Date(Date.UTC(2026, 8, 1))]);
    sheet.getColumn(4).numFmt = "yyyy-mm";
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  it("reads a date cell as an ISO date, whatever the server's time zone", async () => {
    const parsed = await readXlsx(await chirpsWorkbook(), { sheetName: "CHIRPS_rain_csv_Rivers_2016_202" });
    expect(parsed.rows.map((r) => r.values)).toEqual([
      { ADM2_EN: "Emohua", ADM2_PCODE: "NG033010", mean: "15.719154818319", year_month: "2016-01-01" },
      { ADM2_EN: "Emohua", ADM2_PCODE: "NG033010", mean: null, year_month: "2026-09-01" },
    ]);
  });

  it("opens the rainfall sheet, not the areas sheet, when reading for rainfall", async () => {
    expect((await readXlsx(await chirpsWorkbook(), { prefer: "rainfall" })).sheetName).toBe("CHIRPS_rain_csv_Rivers_2016_202");
    expect((await readXlsx(await chirpsWorkbook())).sheetName).toBe("lga_boundaries");
  });
});

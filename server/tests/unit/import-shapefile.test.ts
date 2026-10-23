import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/common/errors/app-error";
import { parseDbf } from "../../src/modules/data-sources/imports/readers/dbf-parser";
import { detectFileType, readImportFile } from "../../src/modules/data-sources/imports/readers/read-import-file";
import { describeCrs, readShapefile } from "../../src/modules/data-sources/imports/readers/shapefile-reader";
import { parseShp } from "../../src/modules/data-sources/imports/readers/shp-parser";
import {
  buildDbf,
  buildShp,
  buildZip,
  holeRing,
  MINNA_PRJ,
  multiPointRecord,
  nullRecord,
  outerRing,
  partsRecord,
  pointRecord,
  reversed,
  square,
  UTM_31N_PRJ,
  WGS84_PRJ,
} from "../shapefile-fixtures";

/** The field-level message a reader put on its 400. */
function fileMessage(read: () => unknown): string {
  try {
    read();
  } catch (err) {
    return (err as ValidationError).errors?.[0]?.message ?? "";
  }
  return "(no error)";
}

async function messageOf(read: () => Promise<unknown>): Promise<string> {
  try {
    await read();
  } catch (err) {
    return (err as ValidationError).errors?.[0]?.message ?? "";
  }
  return "(no error)";
}

const bytes = (text: string) => Buffer.from(text);

describe("parseShp", () => {
  it("reads a polygon with a hole, and a second outer ring, as a MultiPolygon in RFC 7946 winding", () => {
    const outer = square(0, 0, 10);
    const hole = square(2, 2, 2);
    const island = square(20, 20, 2);
    const shp = buildShp(5, [partsRecord(5, [outerRing(outer), holeRing(hole), outerRing(island)])]);

    const [geometry] = parseShp(shp).geometries;
    expect(geometry).toMatchObject({ type: "MultiPolygon" });
    const polygons = (geometry as { coordinates: number[][][][] }).coordinates;
    expect(polygons).toHaveLength(2);
    // The hole went to the ring that contains it, not to the island.
    expect(polygons[0]).toHaveLength(2);
    expect(polygons[1]).toHaveLength(1);
    // Outer rings counter-clockwise, holes clockwise: the first point of each is kept.
    expect(polygons[0]![0]![0]).toEqual([0, 0]);
    expect(polygons[0]![0]![1]).toEqual([10, 0]);
    expect(polygons[0]![1]![1]).toEqual([2, 4]);
  });

  it("gives a single outer ring as a Polygon", () => {
    const [geometry] = parseShp(buildShp(5, [partsRecord(5, [outerRing(square(7, 4.8, 0.01))])])).geometries;
    expect(geometry).toEqual({ type: "Polygon", coordinates: [square(7, 4.8, 0.01)] });
  });

  it("reads a file wound the other way round (every ring counter-clockwise) instead of calling them all holes", () => {
    const shp = buildShp(5, [partsRecord(5, [square(0, 0), square(5, 5)])]);
    expect(parseShp(shp).geometries[0]).toMatchObject({ type: "MultiPolygon" });
  });

  it("keeps a hole that sits in no outer ring as a polygon of its own, rather than dropping it", () => {
    const shp = buildShp(5, [partsRecord(5, [outerRing(square(0, 0)), holeRing(square(50, 50))])]);
    expect(parseShp(shp).geometries[0]).toMatchObject({ type: "MultiPolygon" });
  });

  it("closes a ring that was left open, and counts it", () => {
    const open = outerRing(square(0, 0)).slice(0, -1);
    const result = parseShp(buildShp(5, [partsRecord(5, [open])]));
    expect(result.closedRings).toBe(1);
    const ring = (result.geometries[0] as { coordinates: number[][][] }).coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it("reads X and Y of a PolygonZ and ignores the Z values", () => {
    const shp = buildShp(15, [partsRecord(15, [outerRing(square(1, 2))])]);
    expect(parseShp(shp).geometries[0]).toEqual({ type: "Polygon", coordinates: [square(1, 2)] });
  });

  it("reads points, multipoints and lines, and keeps a record with no shape as null", () => {
    const shp = buildShp(0, [
      pointRecord(7.1, 4.9),
      multiPointRecord([[1, 2], [3, 4]]),
      partsRecord(3, [[[0, 0], [1, 1]]]),
      partsRecord(3, [[[0, 0], [1, 1]], [[5, 5], [6, 6]]]),
      nullRecord(),
    ]);
    const { geometries, extent } = parseShp(shp);
    expect(geometries.map((g) => g?.type ?? null)).toEqual(["Point", "MultiPoint", "LineString", "MultiLineString", null]);
    expect(extent).toEqual([0, 0, 7.1, 6]);
  });

  it("refuses bytes that aren't a shapefile, a cut-short file and a damaged record, each with a 400", () => {
    expect(fileMessage(() => parseShp(bytes("this is not a shapefile at all, just some text, padded out to well over a hundred bytes long......................")))).toMatch(
      /not a valid shapefile/,
    );

    const shp = buildShp(5, [partsRecord(5, [outerRing(square(0, 0))])]);
    expect(fileMessage(() => parseShp(shp.subarray(0, shp.length - 10)))).toMatch(/incomplete/);

    const damaged = Buffer.from(shp);
    damaged.writeInt32LE(1_000_000, 100 + 8 + 40); // a point count far bigger than the record
    expect(fileMessage(() => parseShp(damaged))).toMatch(/Shape 1 .* cut short or damaged/);
  });

  it("refuses MultiPatch shapes", () => {
    const record = Buffer.alloc(8);
    record.writeInt32LE(31, 0);
    expect(fileMessage(() => parseShp(buildShp(31, [record])))).toMatch(/MultiPatch/);
  });
});

describe("parseDbf", () => {
  const columns = [
    { name: "wardname", type: "C", length: 20 },
    { name: "wardcode", type: "C", length: 10 },
    { name: "area_km2", type: "N", length: 10 },
    { name: "updated", type: "D", length: 8 },
    { name: "active", type: "L", length: 1 },
  ] as const;

  it("reads text, numbers, dates and logicals as text, with blanks as null", () => {
    const dbf = buildDbf([...columns], [["Rumuodara", "RVSBAK01", "12.50", "20260922", "T"], ["", "", "", "", "?"]]);
    const table = parseDbf(dbf, null);
    expect(table.headings).toEqual(["wardname", "wardcode", "area_km2", "updated", "active"]);
    expect(table.rows[0]).toEqual({ wardname: "Rumuodara", wardcode: "RVSBAK01", area_km2: "12.50", updated: "2026-09-22", active: "true" });
    expect(table.rows[1]).toEqual({ wardname: null, wardcode: null, area_km2: null, updated: null, active: null });
  });

  it("marks deleted records null and leaves out memo columns, naming them", () => {
    const dbf = buildDbf(
      [{ name: "name", type: "C", length: 10 }, { name: "notes", type: "M", length: 10 }],
      [["Okrika", "1"], ["Bonny", "2"]],
      { deleted: [1] },
    );
    const table = parseDbf(dbf, null);
    expect(table.rows).toEqual([{ name: "Okrika" }, null]);
    expect(table.skipped).toEqual(["notes"]);
  });

  it("decodes UTF-8 by default, Windows Latin-1 when the .cpg or the bytes say so", () => {
    const column = [{ name: "name", type: "C" as const, length: 20 }];
    const utf8 = parseDbf(buildDbf(column, [["Ikwerre-Ọmọ"]]), null);
    expect(utf8.rows[0]).toEqual({ name: "Ikwerre-Ọmọ" });

    const latin1 = buildDbf(column, [["Ñandú"]], { encoding: "latin1" });
    expect(parseDbf(latin1, "1252").rows[0]).toEqual({ name: "Ñandú" });
    expect(parseDbf(latin1, "ISO-8859-1").rows[0]).toEqual({ name: "Ñandú" });
    // No .cpg: invalid UTF-8 falls back to Latin-1 rather than producing replacement characters.
    expect(parseDbf(latin1, null).rows[0]).toEqual({ name: "Ñandú" });
  });

  it("makes repeated column names unique", () => {
    const dbf = buildDbf([{ name: "name", type: "C", length: 5 }, { name: "name", type: "C", length: 5 }], [["a", "b"]]);
    expect(parseDbf(dbf, null).rows[0]).toEqual({ name: "a", "name (2)": "b" });
  });

  it("refuses a table that is cut short", () => {
    const dbf = buildDbf([{ name: "name", type: "C", length: 5 }], [["a"], ["b"]]);
    expect(fileMessage(() => parseDbf(dbf.subarray(0, dbf.length - 8), null))).toMatch(/cut short/);
  });
});

describe("describeCrs", () => {
  it("recognises WGS84 under its common spellings, and anything else by name", () => {
    expect(describeCrs(WGS84_PRJ)).toEqual({ kind: "wgs84" });
    expect(describeCrs('GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],AUTHORITY["EPSG","4326"]]')).toEqual({ kind: "wgs84" });
    expect(describeCrs('GEOGCRS["Some name",ID["EPSG",4326]]')).toEqual({ kind: "wgs84" });
    expect(describeCrs(UTM_31N_PRJ)).toEqual({ kind: "other", name: "WGS_1984_UTM_Zone_31N" });
    expect(describeCrs(MINNA_PRJ)).toEqual({ kind: "other", name: "GCS_Minna" });
    expect(describeCrs("")).toEqual({ kind: "unstated" });
    expect(describeCrs('GEOGCS["GCS_Unknown",DATUM["D_Unknown"]]')).toEqual({ kind: "unstated" });
  });
});

describe("readShapefile", () => {
  const lgaShp = buildShp(5, [partsRecord(5, [outerRing(square(7, 4.8, 0.2))]), partsRecord(5, [outerRing(square(6.5, 4.5, 0.2))]), nullRecord()]);
  const lgaDbf = (options = {}) =>
    buildDbf(
      [{ name: "lga_name", type: "C", length: 20 }, { name: "lga_code", type: "C", length: 10 }],
      [["Obio-Akpor", "NG033015"], ["Okrika", "NG033018"], ["Bonny", "NG033003"]],
      options,
    );

  it("joins the attribute table to the shapes, row by row", () => {
    const parsed = readShapefile({ shp: lgaShp, dbf: lgaDbf(), prj: bytes(WGS84_PRJ) });
    expect(parsed).toMatchObject({ fileType: "shapefile", sheets: [], sheetName: null, headerRow: null, headings: ["lga_name", "lga_code"], warnings: [] });
    expect(parsed.rows.map((r) => r.rowNumber)).toEqual([1, 2, 3]);
    expect(parsed.rows[0]!.values).toEqual({ lga_name: "Obio-Akpor", lga_code: "NG033015" });
    expect(JSON.parse(parsed.rows[0]!.geometry!)).toMatchObject({ type: "Polygon" });
    // A record with no shape stays a row, so the checks can report "The shape is missing".
    expect(parsed.rows[2]!.geometry).toBeNull();
  });

  it("leaves out records the .dbf flags as deleted, and says how many", () => {
    const parsed = readShapefile({ shp: lgaShp, dbf: lgaDbf({ deleted: [1] }), prj: bytes(WGS84_PRJ) });
    expect(parsed.rows.map((r) => r.rowNumber)).toEqual([1, 3]);
    expect(parsed.warnings).toEqual(["1 records flagged as deleted in the .dbf were left out."]);
  });

  it("reads a bare .shp (shapes only) and warns there are no names and no coordinate system", () => {
    const parsed = readShapefile({ shp: lgaShp });
    expect(parsed.headings).toEqual([]);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.warnings).toHaveLength(2);
    expect(parsed.warnings[0]).toMatch(/No coordinate system \(\.prj\).*assumed to be WGS84/);
    expect(parsed.warnings[1]).toMatch(/No \.dbf attribute table/);
  });

  it("refuses a .dbf that doesn't belong to the .shp", () => {
    const wrong = buildDbf([{ name: "name", type: "C", length: 5 }], [["a"], ["b"]]);
    expect(fileMessage(() => readShapefile({ shp: lgaShp, dbf: wrong, prj: bytes(WGS84_PRJ) }))).toMatch(/2 records but the \.shp has 3 shapes/);
  });

  it("refuses a coordinate system other than WGS84, naming it", () => {
    expect(fileMessage(() => readShapefile({ shp: lgaShp, prj: bytes(UTM_31N_PRJ) }))).toMatch(/WGS_1984_UTM_Zone_31N.*Only EPSG:4326/);
    expect(fileMessage(() => readShapefile({ shp: lgaShp, prj: bytes(MINNA_PRJ) }))).toMatch(/GCS_Minna/);
  });

  it("refuses metres with no .prj, and a .prj that contradicts the coordinates", () => {
    const metres = buildShp(5, [partsRecord(5, [outerRing(square(500000, 500000, 1000))])]);
    expect(fileMessage(() => readShapefile({ shp: metres }))).toMatch(/look like projected metres/);
    expect(fileMessage(() => readShapefile({ shp: metres, prj: bytes(WGS84_PRJ) }))).toMatch(/says it is in WGS84/);
  });
});

describe("zip bundles and file detection", () => {
  const shp = buildShp(5, [partsRecord(5, [outerRing(square(7, 4.8, 0.2))])]);
  const dbf = buildDbf([{ name: "lga_name", type: "C", length: 20 }], [["Obio-Akpor"]]);
  const shx = Buffer.alloc(108); // the index: ignored, the .shp is read straight through

  it("reads a zipped shapefile, finding the .dbf, .prj and .cpg beside it whatever the case", async () => {
    const zip = buildZip({
      "Rivers/Rivers_State_LGA.SHP": shp,
      "Rivers/Rivers_State_LGA.dbf": dbf,
      "Rivers/Rivers_State_LGA.shx": shx,
      "Rivers/Rivers_State_LGA.PRJ": WGS84_PRJ,
      "Rivers/Rivers_State_LGA.cpg": "UTF-8",
      "__MACOSX/Rivers/._Rivers_State_LGA.shp": "junk",
    });
    const parsed = await readImportFile({ originalName: "lga.zip", buffer: zip });
    expect(parsed).toMatchObject({ fileType: "shapefile", headings: ["lga_name"], warnings: [] });
    expect(parsed.rows[0]!.values).toEqual({ lga_name: "Obio-Akpor" });
  });

  it("reads a zip with no extension by looking inside it", async () => {
    const parsed = await readImportFile({ originalName: "upload", buffer: buildZip({ "a.shp": shp, "a.dbf": dbf, "a.prj": WGS84_PRJ }) });
    expect(parsed.fileType).toBe("shapefile");
  });

  it("reads a single data file out of a zip (GeoJSON, CSV)", async () => {
    const collection = JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { name: "Okrika" }, geometry: null }] });
    expect((await readImportFile({ originalName: "x.zip", buffer: buildZip({ "wards.geojson": collection }) })).fileType).toBe("geojson");
    expect((await readImportFile({ originalName: "x.zip", buffer: buildZip({ "sub/rain.csv": "a,b\n1,2" }) })).fileType).toBe("csv");
  });

  it("explains a zip with two shapefiles, one with nothing readable, and one that isn't a zip", async () => {
    expect(await messageOf(() => readImportFile({ originalName: "x.zip", buffer: buildZip({ "a.shp": shp, "b.shp": shp }) }))).toMatch(/2 shapefiles .*one at a time/);
    expect(await messageOf(() => readImportFile({ originalName: "x.zip", buffer: buildZip({ "readme.txt": "hi" }) }))).toMatch(/nothing this system can read/);
    expect(await messageOf(() => readImportFile({ originalName: "x.zip", buffer: bytes("not a zip") }))).toMatch(/could not be opened/);
  });

  it("refuses a zip that unpacks to more than the limit, going by what the zip claims", { timeout: 30_000 }, async () => {
    const bomb = buildZip({ "huge.shp": Buffer.alloc(101 * 1024 * 1024) });
    expect(bomb.length).toBeLessThan(1024 * 1024);
    expect(await messageOf(() => readImportFile({ originalName: "x.zip", buffer: bomb }))).toMatch(/unpacks to more than 100 MB/);
  });

  it("detects a shapefile by its header when the name has no extension", () => {
    expect(detectFileType({ originalName: "upload", buffer: shp })).toBe("shapefile");
  });

  it("refuses the parts of a shapefile on their own, saying where they belong", () => {
    for (const name of ["Rivers_State_LGA.shx", "Rivers_State_LGA.dbf", "Rivers_State_LGA.prj"]) {
      expect(fileMessage(() => detectFileType({ originalName: name, buffer: shx }))).toMatch(/only one part of a shapefile.*zip/);
    }
  });

  it("refuses types it can't read, listing what it can", () => {
    expect(fileMessage(() => detectFileType({ originalName: "boundary.kml", buffer: bytes("<kml/>") }))).toMatch(/isn't supported yet.*shapefile.*Excel.*GeoJSON.*CSV/);
  });
});

// The real file the feature was built for. It's kept at the repo root and isn't committed, so
// this runs only where it's present.
const realShp = path.resolve(__dirname, "../../../Rivers_State_LGA.shp");
describe.skipIf(!existsSync(realShp))("the real Rivers_State_LGA.shp", () => {
  it("reads as 23 polygons inside Rivers State, with a warning that it came without names or a .prj", async () => {
    const parsed = await readImportFile({ originalName: "Rivers_State_LGA.shp", buffer: readFileSync(realShp) });
    expect(parsed.fileType).toBe("shapefile");
    expect(parsed.rows).toHaveLength(23);
    expect(parsed.rows.every((r) => JSON.parse(r.geometry!).type === "Polygon")).toBe(true);
    expect(parsed.warnings).toHaveLength(2);
  });
});

import { zipSync } from "fflate";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { readGeoPackage } from "../../src/modules/map-layers/gpkg-reader";
import { recoverGeoPackageRows } from "../../src/modules/map-layers/gpkg-recover";
import { BUILDING_MIN_ZOOM, LAYER_FEATURE_LIMIT } from "../../src/modules/map-layers/layer-rules";
import { MapLayerLoaderService, type LoadRequest } from "../../src/modules/map-layers/map-layer-loader.service";
import { prepareBuildings } from "../../src/modules/map-layers/map-layer-rows";
import { osmFiles } from "../../src/modules/map-layers/osm-extract";
import { cutShort, makeGeoPackage, type FixtureRow } from "../gpkg-fixtures";
import { InMemoryCountryRepository, makeCountry } from "../geo-fakes";
import { FakeLoadStore, validationMessageAsync } from "../map-layer-fakes";

const outline = (x: number) => ({
  type: "MultiPolygon" as const,
  coordinates: [[[[x, 4.8], [x + 0.0001, 4.8], [x + 0.0001, 4.8001], [x, 4.8001], [x, 4.8]]]],
});

function buildingRows(count: number, offset = 0): FixtureRow[] {
  return Array.from({ length: count }, (_, i) => ({
    osm_id: String(1000 + offset + i),
    fclass: "building",
    type: i === 0 ? "house" : null,
    name: i === 1 ? "Rumuokoro Market Hall" : null,
    geom: outline(7 + (offset + i) * 0.001),
  }));
}

const BUILDINGS_1 = "gis_osm_buildings_a_free_1_rivers";

/** A buildings file whose spatial-index stand-in (the last pages) was cut off in transit. */
async function cutShortBuildings(rows: number, recordedCount = rows): Promise<Buffer> {
  const file = await makeGeoPackage(buildingRows(rows), { table: BUILDINGS_1, withType: true, featureCount: recordedCount, trailingPages: 6 });
  return cutShort(file, 4);
}

describe("recoverGeoPackageRows", () => {
  it("finds exactly the rows SQLite itself reads in an intact file", async () => {
    const file = await makeGeoPackage(buildingRows(40), { table: BUILDINGS_1, withType: true, featureCount: 40 });
    const recovered = await recoverGeoPackageRows(file, "b.gpkg");

    const SQL = await initSqlJs();
    const db = new SQL.Database(file);
    const direct = db.exec(`SELECT fid, osm_id, type FROM "${BUILDINGS_1}" ORDER BY fid`)[0]!.values;
    db.close();

    expect(recovered).toMatchObject({ tableName: BUILDINGS_1, geometryColumn: "geom", crs: "EPSG:4326", expectedRows: 40, incompleteRows: 0 });
    expect(recovered.rows.map((row) => [row.fid, row.osm_id, row.type])).toEqual(direct);
    expect(recovered.rows[0]!.geom).toBeInstanceOf(Uint8Array);
  });

  it("reads the rows of a file whose end is missing", async () => {
    const recovered = await recoverGeoPackageRows(await cutShortBuildings(25), "b.gpkg");
    expect(recovered.rows).toHaveLength(25);
    expect(recovered.pagesPresent).toBeLessThan(recovered.pagesExpected);
  });

  it("refuses when the part that describes the table is missing", async () => {
    const file = await makeGeoPackage(buildingRows(3), { table: BUILDINGS_1, withType: true });
    // Keep only the first page: the schema's later pages and the data are gone.
    const firstPage = Buffer.from(file.subarray(0, 4096));
    expect(await validationMessageAsync(() => recoverGeoPackageRows(firstPage, "b.gpkg"))).toMatch(/can't be recovered/);
  });
});

describe("readGeoPackage on a cut-short file", () => {
  it("loads it when every row it records arrived, and says what happened", async () => {
    const { features, notes } = await readGeoPackage(await cutShortBuildings(25), "b.gpkg");
    expect(features).toHaveLength(25);
    expect(features[0]).toEqual({
      properties: { fid: 1, osm_id: "1000", code: 1500, fclass: "building", name: null, type: "house" },
      geometry: outline(7),
    });
    expect(notes).toEqual([expect.stringMatching(/^b\.gpkg was cut short \([\d.]+ of [\d.]+ MB\), but all 25 of its rows were in the part that arrived/)]);
  });

  it("refuses it when rows are missing, unless a partial load is asked for", async () => {
    const file = await cutShortBuildings(25, 30);
    expect(await validationMessageAsync(() => readGeoPackage(file, "b.gpkg"))).toMatch(
      /b\.gpkg is cut short \(.*\): only 25 of 30 rows could be recovered\. Ask for a fresh copy, or load what is there on purpose \(--accept-partial/,
    );
    const partial = await readGeoPackage(file, "b.gpkg", { acceptPartial: true });
    expect(partial.features).toHaveLength(25);
    expect(partial.notes).toEqual([expect.stringMatching(/25 of 30 rows were recovered; the rest are missing/)]);
  });

  it("still refuses a cut-short file in another CRS", async () => {
    const file = await makeGeoPackage(buildingRows(3), {
      table: BUILDINGS_1,
      withType: true,
      featureCount: 3,
      trailingPages: 6,
      srs: { id: 32632, organization: "EPSG", code: 32632 },
    });
    expect(await validationMessageAsync(() => readGeoPackage(cutShort(file, 4), "b.gpkg"))).toMatch(/is in EPSG:32632/);
  });
});

describe("prepareBuildings", () => {
  const feature = (properties: Record<string, unknown>, geometry: unknown = outline(7)) => ({ properties, geometry: geometry as never });

  it("keeps the id, the OSM building tag and the name", () => {
    const { rows, rejected } = prepareBuildings([feature({ osm_id: "5", fclass: "building", type: "school", name: " Rivers State University " })]);
    expect(rejected).toEqual({});
    expect(rows).toEqual([{ osmId: "5", name: "Rivers State University", buildingType: "school", shape: JSON.stringify(outline(7)) }]);
  });

  it("needs an id and a shape, and keeps one of each id", () => {
    const { rows, rejected } = prepareBuildings([
      feature({ fclass: "building" }),
      feature({ osm_id: "6" }, null),
      feature({ osm_id: "7" }),
      feature({ osm_id: "7" }),
      feature({ osm_id: "8", type: "x".repeat(41) }),
    ]);
    expect(rows.map((row) => row.osmId)).toEqual(["7"]);
    expect(rejected).toEqual({
      "no osm_id": 1,
      "no shape": 1,
      "the same id appears more than once in the file": 1,
      "a text value is too long for its column": 1,
    });
  });
});

describe("building rules", () => {
  it("draws buildings only at street level, and caps a reply", () => {
    expect(BUILDING_MIN_ZOOM).toBe(15);
    expect(LAYER_FEATURE_LIMIT.buildings).toBe(10_000);
  });
});

describe("osmFiles for buildings", () => {
  it("takes only the numbered building files out of the extract", async () => {
    const gpkg = await makeGeoPackage([]);
    const zip = Buffer.from(
      zipSync({
        "osm/gis_osm_buildings_a_free_2_rivers.gpkg": gpkg,
        "osm/gis_osm_buildings_a_free_1_rivers.gpkg": gpkg,
        "osm/gis_osm_pois_free_1_rivers.gpkg": gpkg,
        "osm/gis_osm_roads_free_1_rivers.gpkg": gpkg,
      }),
    );
    expect(osmFiles("buildings", zip, "osm.zip").map((file) => file.fileName)).toEqual([
      "gis_osm_buildings_a_free_1_rivers.gpkg",
      "gis_osm_buildings_a_free_2_rivers.gpkg",
    ]);
  });
});

describe("MapLayerLoaderService: buildings", () => {
  const SOURCE = "40000000-0000-4000-8000-00000000000b";
  const base: LoadRequest = { countryCode: "NGA", wardLevel: 3, dryRun: false };

  function build() {
    const store = new FakeLoadStore();
    store.tx.existingSourceIds.add(SOURCE);
    return { store, service: new MapLayerLoaderService(store, new InMemoryCountryRepository([makeCountry()])) };
  }

  async function extract(part1: Buffer): Promise<Buffer> {
    const part2 = await makeGeoPackage(buildingRows(3, 100), { table: "gis_osm_buildings_a_free_2_rivers", withType: true, featureCount: 3 });
    return Buffer.from(
      zipSync({
        "osm/gis_osm_buildings_a_free_1_rivers.gpkg": part1,
        "osm/gis_osm_buildings_a_free_2_rivers.gpkg": part2,
        "osm/gis_osm_pois_free_1_rivers.gpkg": await makeGeoPackage([]),
      }),
    );
  }

  it("loads both parts of the extract, the cut-short one with a note, linking wards at the ward level", async () => {
    const { store, service } = build();
    const report = await service.load({ ...base, buildings: { fileName: "osm.zip", buffer: await extract(await cutShortBuildings(25)), sourceId: SOURCE } });

    expect(report.layers.map((layer) => [layer.layer, layer.file, layer.featuresInFile, layer.inserted])).toEqual([
      ["buildings", "gis_osm_buildings_a_free_1_rivers.gpkg", 25, 25],
      ["buildings", "gis_osm_buildings_a_free_2_rivers.gpkg", 3, 3],
    ]);
    expect(report.layers[0]!.notes).toEqual([expect.stringMatching(/was cut short .* all 25 of its rows/)]);
    expect(report.layers[1]!.notes).toEqual([]);
    expect(store.tx.buildings[0]!.context).toMatchObject({ countryCode: "NGA", sourceId: SOURCE, wardLevel: 3 });
    expect(store.tx.buildings[0]!.rows[0]).toMatchObject({ osmId: "1000", buildingType: "house" });
    expect(store.committed).toBe(true);
  });

  it("refuses an extract with missing buildings before the database is opened, and loads it on purpose with acceptPartial", async () => {
    const buffer = await extract(await cutShortBuildings(25, 30));
    const refused = build();
    expect(await validationMessageAsync(() => refused.service.load({ ...base, buildings: { fileName: "osm.zip", buffer, sourceId: SOURCE } }))).toMatch(
      /only 25 of 30 rows could be recovered/,
    );
    expect(refused.store.committed || refused.store.rolledBack).toBe(false);

    const accepted = build();
    const report = await accepted.service.load({ ...base, acceptPartial: true, buildings: { fileName: "osm.zip", buffer, sourceId: SOURCE } });
    expect(report.layers[0]).toMatchObject({ inserted: 25, notes: [expect.stringMatching(/25 of 30 rows were recovered/)] });
  });

  it("clears a country's buildings", async () => {
    const { store, service } = build();
    store.tx.stored.buildings = { NGA: 414_556 };
    expect(await service.clear({ countryCode: "NGA", layers: ["buildings"], dryRun: false })).toEqual({ dryRun: false, deleted: { buildings: 414_556 } });
  });
});

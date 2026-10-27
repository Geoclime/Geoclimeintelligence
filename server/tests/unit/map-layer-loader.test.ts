import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/common/errors/app-error";
import { LOAD_BATCH_SIZE, MapLayerLoaderService, type LoadRequest } from "../../src/modules/map-layers/map-layer-loader.service";
import { InMemoryCountryRepository, makeCountry } from "../geo-fakes";
import { FakeLoadStore, validationMessageAsync } from "../map-layer-fakes";

const line = { type: "LineString", coordinates: [[7, 4.8], [7.01, 4.81]] };
const area = { type: "Polygon", coordinates: [[[7, 4.8], [7.01, 4.8], [7.01, 4.81], [7, 4.8]]] };

const entry = (layer: string, file: string, source: string, url: string) => ({
  file,
  layer,
  source,
  source_url: url,
  resource: "Shapefile",
  licence: "ODbL",
  download_date_utc: "2026-10-27",
  source_last_modified: "2026-10-10",
});

const PROVENANCE = [
  entry("roads", "rivers_roads.geojson", "HDX dataset 'Roads of Nigeria' (OpenStreetMap contributors)", "https://example.test/roads"),
  entry("waterways", "rivers_waterways.geojson", "HDX dataset 'Waterways of Nigeria' (OpenStreetMap contributors)", "https://example.test/water"),
  entry("waterway_polygons", "rivers_waterway_polygons.geojson", "HDX dataset 'Waterways of Nigeria' (OpenStreetMap contributors)", "https://example.test/water"),
  { ...entry("state_boundary", "(clip)", "geoBoundaries gbOpen NGA ADM1", "https://example.test/adm1"), licence: "CC BY 4.0" },
];

function collection(features: unknown[], crsName?: string): string {
  return JSON.stringify({ type: "FeatureCollection", ...(crsName ? { crs: { properties: { name: crsName } } } : {}), features });
}

const roadFeature = (i: number) => ({ type: "Feature", properties: { osm_id: `way/${i}`, road_type: "residential" }, geometry: line });
const waterFeature = (id: string, geometry: unknown) => ({
  type: "Feature",
  properties: { osm_id: id, water_class: "river", class_basis: "tag" },
  geometry,
});

function deliveryZip(roads: unknown[] = [roadFeature(1), roadFeature(2)], overrides: Record<string, string> = {}): Buffer {
  return Buffer.from(
    zipSync({
      "provenance.json": strToU8(JSON.stringify(PROVENANCE)),
      "rivers_roads.geojson": strToU8(collection(roads)),
      "rivers_waterways.geojson": strToU8(collection([waterFeature("way/10", line)])),
      "rivers_waterway_polygons.geojson": strToU8(collection([waterFeature("relation/11", area)])),
      ...Object.fromEntries(Object.entries(overrides).map(([name, body]) => [name, strToU8(body)])),
    }),
  );
}

const settlementFile = (count = 2) =>
  Buffer.from(
    collection(
      Array.from({ length: count }, (_, i) => ({
        type: "Feature",
        properties: { set_id: `${i + 1}`, set_name: `Place ${i + 1}`, wardcode: "RVSKPR14", is_primary: " ", source: "OSGOF" },
        geometry: { type: "Point", coordinates: [7.29, 4.6] },
      })),
    ),
  );

function build() {
  const store = new FakeLoadStore();
  const countries = new InMemoryCountryRepository([makeCountry()]);
  return { store, service: new MapLayerLoaderService(store, countries) };
}

const base: LoadRequest = { countryCode: "NGA", wardLevel: 3, dryRun: false };

describe("MapLayerLoaderService: the delivery zip", () => {
  it("loads roads, waterways and waterway areas, tagged with the country and its rough box", async () => {
    const { store, service } = build();
    const report = await service.load({ ...base, zip: deliveryZip() });

    expect(report.layers.map((layer) => [layer.layer, layer.inserted])).toEqual([
      ["roads", 2],
      ["waterways", 1],
      ["waterway areas", 1],
    ]);
    expect(store.committed).toBe(true);
    expect(store.tx.roads[0]!.context).toMatchObject({ countryCode: "NGA", bbox: [2.5, 4.0, 14.8, 14.0] });
    expect(store.tx.roads[0]!.rows.map((row) => row.osmId)).toEqual(["way/1", "way/2"]);
  });

  it("records one data source per dataset: a dataset's lines and areas share theirs", async () => {
    const { store, service } = build();
    const report = await service.load({ ...base, zip: deliveryZip() });

    expect(store.tx.sources.map((source) => source.datasetName)).toEqual(["Roads of Nigeria (HDX)", "Waterways of Nigeria (HDX)"]);
    expect(report.layers.map((layer) => layer.sourceId)).toEqual(["source-1", "source-2", "source-2"]);
    expect(report.layers.map((layer) => layer.sourceCreated)).toEqual([true, true, false]);
  });

  it("sends big layers in batches", async () => {
    const { store, service } = build();
    const roads = Array.from({ length: LOAD_BATCH_SIZE * 2 + 10 }, (_, i) => roadFeature(i));
    const report = await service.load({ ...base, zip: deliveryZip(roads) });

    expect(store.tx.roads.map((batch) => batch.rows.length)).toEqual([LOAD_BATCH_SIZE, LOAD_BATCH_SIZE, 10]);
    expect(report.layers[0]!.inserted).toBe(LOAD_BATCH_SIZE * 2 + 10);
  });

  it("is safe to run twice: rows stored before are counted and left alone", async () => {
    const { store, service } = build();
    store.tx.known = new Set(["way/1", "way/2"]);
    const report = await service.load({ ...base, zip: deliveryZip() });
    expect(report.layers[0]).toMatchObject({ inserted: 0, alreadyPresent: 2 });
  });

  it("reports features left out before the database, with the reason", async () => {
    const { service } = build();
    const bad = { type: "Feature", properties: { osm_id: "way/3" }, geometry: line };
    const report = await service.load({ ...base, zip: deliveryZip([roadFeature(1), bad]) });
    expect(report.layers[0]).toMatchObject({ featuresInFile: 2, inserted: 1, rejected: { "no road type": 1 } });
  });

  it("changes nothing on a dry run, and still reports what would happen", async () => {
    const { store, service } = build();
    const report = await service.load({ ...base, zip: deliveryZip(), dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.layers).toHaveLength(3);
    expect(store.committed).toBe(false);
    expect(store.rolledBack).toBe(true);
  });

  it("refuses a bad file before the database is opened", async () => {
    const { store, service } = build();
    const utm = collection([roadFeature(1)], "EPSG:26331");
    await expect(service.load({ ...base, zip: deliveryZip(undefined, { "rivers_roads.geojson": utm }) })).rejects.toBeInstanceOf(ValidationError);
    expect(store.committed).toBe(false);
    expect(store.rolledBack).toBe(false);
    expect(store.tx.sources).toEqual([]);
  });

  it("refuses a zip whose provenance leaves a layer unsourced", async () => {
    const { service } = build();
    const without = PROVENANCE.filter((e) => e.layer !== "waterway_polygons");
    const zip = Buffer.from(
      zipSync({
        "provenance.json": strToU8(JSON.stringify(without)),
        "rivers_roads.geojson": strToU8(collection([roadFeature(1)])),
        "rivers_waterways.geojson": strToU8(collection([])),
        "rivers_waterway_polygons.geojson": strToU8(collection([])),
      }),
    );
    expect(await validationMessageAsync(() => service.load({ ...base, zip }))).toMatch(/"waterway_polygons" layer/);
  });
});

describe("MapLayerLoaderService: settlements", () => {
  const settlements = (sourceId = "40000000-0000-4000-8000-000000000001") => ({
    fileName: "rivers_state_settlement_names.geojson",
    buffer: settlementFile(),
    sourceId,
  });

  it("loads settlements against an existing data source, looking wards up at the ward level", async () => {
    const { store, service } = build();
    store.tx.existingSourceIds.add("40000000-0000-4000-8000-000000000001");
    const report = await service.load({ ...base, settlements: settlements() });

    expect(report.layers).toEqual([expect.objectContaining({ layer: "settlements", inserted: 2, sourceCreated: false })]);
    expect(store.tx.settlements[0]!.context).toMatchObject({ wardLevel: 3, countryCode: "NGA", sourceId: "40000000-0000-4000-8000-000000000001" });
    expect(store.tx.sources).toEqual([]);
  });

  it("refuses a data source that does not exist, and saves nothing", async () => {
    const { store, service } = build();
    expect(await validationMessageAsync(() => service.load({ ...base, settlements: settlements("40000000-0000-4000-8000-0000000000ff") }))).toMatch(
      /No data source with id/,
    );
    expect(store.committed).toBe(false);
    expect(store.rolledBack).toBe(true);
  });

  it("loads the zip and the settlements in one transaction", async () => {
    const { store, service } = build();
    store.tx.existingSourceIds.add("40000000-0000-4000-8000-000000000001");
    const report = await service.load({ ...base, zip: deliveryZip(), settlements: settlements() });
    expect(report.layers.map((layer) => layer.layer)).toEqual(["roads", "waterways", "waterway areas", "settlements"]);
    expect(store.committed).toBe(true);
  });
});

describe("MapLayerLoaderService: bad requests", () => {
  it("needs something to load", async () => {
    expect(await validationMessageAsync(() => build().service.load(base))).toMatch(/Nothing to load/);
  });

  it("needs a country that exists", async () => {
    expect(await validationMessageAsync(() => build().service.load({ ...base, countryCode: "GHA", zip: deliveryZip() }))).toMatch(/No country with code GHA/);
  });

  it("runs without a rough box when the country has none, leaving the check to the database to skip", async () => {
    const store = new FakeLoadStore();
    const service = new MapLayerLoaderService(store, new InMemoryCountryRepository([makeCountry({ bbox: null })]));
    await service.load({ ...base, zip: deliveryZip() });
    expect(store.tx.roads[0]!.context.bbox).toBeNull();
  });
});

describe("MapLayerLoaderService: clearing a country's layers", () => {
  function withStored() {
    const built = build();
    built.store.tx.stored = { roads: { NGA: 47507 }, waterways: { NGA: 4033 }, settlements: {} };
    return built;
  }

  it("deletes the country's roads and waterways in one transaction, and says how many went", async () => {
    const { store, service } = withStored();
    const report = await service.clear({ countryCode: "NGA", layers: ["roads", "waterways"], dryRun: false });
    expect(report).toEqual({ dryRun: false, deleted: { roads: 47507, waterways: 4033 } });
    expect(store.committed).toBe(true);
  });

  it("clears only the layers it is given", async () => {
    const { store, service } = withStored();
    const report = await service.clear({ countryCode: "NGA", layers: ["waterways"], dryRun: false });
    expect(report.deleted).toEqual({ waterways: 4033 });
    expect(store.tx.stored.roads.NGA).toBe(47507);
  });

  it("rolls back a dry run, and still reports what would go", async () => {
    const { store, service } = withStored();
    const report = await service.clear({ countryCode: "NGA", layers: ["roads"], dryRun: true });
    expect(report).toEqual({ dryRun: true, deleted: { roads: 47507 } });
    expect(store.rolledBack).toBe(true);
    expect(store.committed).toBe(false);
  });

  it("needs a layer and a country that exists, and touches nothing otherwise", async () => {
    const { store, service } = withStored();
    expect(await validationMessageAsync(() => service.clear({ countryCode: "NGA", layers: [], dryRun: false }))).toMatch(/at least one layer/);
    expect(await validationMessageAsync(() => service.clear({ countryCode: "GHA", layers: ["roads"], dryRun: false }))).toMatch(
      /No country with code GHA/,
    );
    expect(store.committed || store.rolledBack).toBe(false);
  });
});
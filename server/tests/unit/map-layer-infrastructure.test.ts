import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseGpkgGeometry } from "../../src/modules/map-layers/gpkg-geometry";
import { readGeoPackage } from "../../src/modules/map-layers/gpkg-reader";
import { FACILITY_TYPES, facilityTypeOf, facilityTypesAtZoom, LAYER_FEATURE_LIMIT } from "../../src/modules/map-layers/layer-rules";
import { MapLayerLoaderService, type LoadRequest } from "../../src/modules/map-layers/map-layer-loader.service";
import { NOT_A_FACILITY, prepareInfrastructure } from "../../src/modules/map-layers/map-layer-rows";
import { osmFiles } from "../../src/modules/map-layers/osm-extract";
import { gpkgBlob, makeGeoPackage } from "../gpkg-fixtures";
import { InMemoryCountryRepository, makeCountry } from "../geo-fakes";
import { FakeLoadStore, validationMessageAsync } from "../map-layer-fakes";

const point = (x = 7.0, y = 4.8) => ({ type: "Point" as const, coordinates: [x, y] });
const square = { type: "Polygon" as const, coordinates: [[[7, 4.8], [7.01, 4.8], [7.01, 4.81], [7, 4.81], [7, 4.8]]] };

function validationMessageSync(run: () => unknown): string {
  try {
    run();
  } catch (err) {
    const errors = (err as { errors?: { message: string }[] }).errors;
    if (errors) return errors.map((e) => e.message).join(" | ");
    throw err;
  }
  throw new Error("expected a ValidationError, but nothing was thrown");
}

describe("parseGpkgGeometry", () => {
  it("decodes points, polygons and multipolygons after the GeoPackage header", () => {
    expect(parseGpkgGeometry(gpkgBlob(point()))).toEqual(point());
    expect(parseGpkgGeometry(gpkgBlob(square))).toEqual(square);
    const multi = { type: "MultiPolygon" as const, coordinates: [square.coordinates, square.coordinates] };
    expect(parseGpkgGeometry(gpkgBlob(multi))).toEqual(multi);
  });

  it("reads past Z values (ISO WKB 1001) and big-endian WKB", () => {
    const blob = Buffer.alloc(8 + 1 + 4 + 24);
    blob.write("GP", 0, "latin1");
    blob.writeUInt8(0b0000_0000, 3); // no envelope
    blob.writeUInt8(0, 8); // big-endian
    blob.writeUInt32BE(1001, 9); // Point Z
    blob.writeDoubleBE(7.1, 13);
    blob.writeDoubleBE(4.9, 21);
    blob.writeDoubleBE(12, 29);
    expect(parseGpkgGeometry(new Uint8Array(blob))).toEqual({ type: "Point", coordinates: [7.1, 4.9] });
  });

  it("returns null for an empty, cut-off or foreign blob instead of throwing", () => {
    const empty = Buffer.from(gpkgBlob(point()));
    empty.writeUInt8(0b0001_0011, 3);
    expect(parseGpkgGeometry(new Uint8Array(empty))).toBeNull();
    expect(parseGpkgGeometry(gpkgBlob(square).subarray(0, 50))).toBeNull();
    expect(parseGpkgGeometry(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBeNull();
    expect(parseGpkgGeometry(null)).toBeNull();
  });
});

describe("readGeoPackage", () => {
  it("reads every row: columns as properties, the geometry as GeoJSON", async () => {
    const file = await makeGeoPackage([
      { osm_id: "101", fclass: "hospital", name: "Braithwaite Memorial", geom: point() },
      { osm_id: "102", fclass: "kiosk", geom: null },
    ]);
    const { features, notes } = await readGeoPackage(file, "pois.gpkg");
    expect(features).toHaveLength(2);
    expect(features[0]).toEqual({
      properties: { fid: 1, osm_id: "101", code: 2000, fclass: "hospital", name: "Braithwaite Memorial" },
      geometry: point(),
    });
    expect(features[1]!.geometry).toBeNull();
    expect(notes).toEqual([]);
  });

  it("refuses a GeoPackage in any CRS other than WGS84 (rule 7)", async () => {
    const file = await makeGeoPackage([{ osm_id: "1", fclass: "school", geom: point() }], {
      srs: { id: 32632, organization: "EPSG", code: 32632 },
    });
    expect(await validationMessageAsync(() => readGeoPackage(file, "utm.gpkg"))).toMatch(/utm\.gpkg is in EPSG:32632\. Only EPSG:4326/);
  });

  it("refuses a file that is not a GeoPackage", async () => {
    expect(await validationMessageAsync(() => readGeoPackage(Buffer.from("not sqlite at all"), "x.gpkg"))).toMatch(/is not a GeoPackage/);
  });
});

describe("osmFiles", () => {
  it("takes only the facility GeoPackages out of a Geofabrik zip, in name order", async () => {
    const gpkg = await makeGeoPackage([]);
    const zip = Buffer.from(
      zipSync({
        "osm/gis_osm_transport_a_free_1_rivers.gpkg": gpkg,
        "osm/gis_osm_pois_free_1_rivers.gpkg": gpkg,
        "osm/gis_osm_pofw_a_free_1_rivers.gpkg": gpkg,
        "osm/gis_osm_buildings_a_free_1_rivers.gpkg": gpkg,
        "osm/gis_osm_roads_free_1_rivers.gpkg": gpkg,
      }),
    );
    expect(osmFiles("infrastructure", zip, "osm.zip").map((file) => file.fileName)).toEqual([
      "gis_osm_pofw_a_free_1_rivers.gpkg",
      "gis_osm_pois_free_1_rivers.gpkg",
      "gis_osm_transport_a_free_1_rivers.gpkg",
    ]);
  });

  it("limits each GeoPackage's unpacked size, not the total, since they are unpacked one at a time", async () => {
    const small = await makeGeoPackage([]);
    const zip = Buffer.from(zipSync({ "rivers_pois.gpkg": small, "rivers_pofw.gpkg": small }));
    // Two files under the limit pass even though together they are over it.
    expect(osmFiles("infrastructure", zip, "x.zip", small.length + 1)).toHaveLength(2);
    expect(validationMessageSync(() => osmFiles("infrastructure", zip, "x.zip", small.length - 1))).toMatch(
      /rivers_pois\.gpkg \(0 MB\), rivers_pofw\.gpkg \(0 MB\) would unpack to more than the 0 MB allowed for one GeoPackage \(IMPORT_MAX_GPKG_MB/,
    );
  });

  it("also reads the team's clipped handover, named <area>_<theme>.gpkg", async () => {
    const gpkg = await makeGeoPackage([]);
    const folder = "Rivers_State_OSM_All_Features_2026-10-29";
    const zip = Buffer.from(
      zipSync({
        [`${folder}/rivers_pois.gpkg`]: gpkg,
        [`${folder}/rivers_pois_a.gpkg`]: gpkg,
        [`${folder}/rivers_pofw.gpkg`]: gpkg,
        [`${folder}/rivers_transport_a.gpkg`]: gpkg,
        [`${folder}/rivers_traffic.gpkg`]: gpkg,
        [`${folder}/rivers_places.gpkg`]: gpkg,
        [`${folder}/rivers_buildings_a.gpkg`]: gpkg,
        [`${folder}/rivers_state_boundary.gpkg`]: gpkg,
        [`${folder}/provenance.json`]: new Uint8Array([123, 125]),
      }),
    );
    expect(osmFiles("infrastructure", zip, "handover.zip").map((file) => file.fileName)).toEqual([
      "rivers_pofw.gpkg",
      "rivers_pois_a.gpkg",
      "rivers_pois.gpkg",
      "rivers_transport_a.gpkg",
    ]);
    expect(osmFiles("buildings", zip, "handover.zip").map((file) => file.fileName)).toEqual(["rivers_buildings_a.gpkg"]);
  });

  it("passes a single .gpkg through, and refuses a zip with no facility files or a file of any other kind", async () => {
    const gpkg = await makeGeoPackage([]);
    const [single, ...others] = osmFiles("infrastructure", gpkg, "x/pois.gpkg");
    expect(others).toEqual([]);
    expect(single!.fileName).toBe("pois.gpkg");
    expect(single!.read()).toBe(gpkg);
    const roadsOnly = Buffer.from(zipSync({ "gis_osm_roads_free_1.gpkg": gpkg }));
    expect(validationMessageSync(() => osmFiles("infrastructure", roadsOnly, "roads.zip"))).toMatch(/has no OpenStreetMap facility files/);
    expect(validationMessageSync(() => osmFiles("infrastructure", Buffer.from("{}"), "x.json"))).toMatch(/neither a GeoPackage/);
  });
});

describe("facility types", () => {
  it("groups OSM classes into the types the map and analysis use", () => {
    expect(facilityTypeOf("hospital")).toBe("health");
    expect(facilityTypeOf(" Pharmacy ")).toBe("health");
    expect(facilityTypeOf("school")).toBe("education");
    expect(facilityTypeOf("police")).toBe("emergency");
    expect(facilityTypeOf("ferry_terminal")).toBe("transport");
    expect(facilityTypeOf("water_well")).toBe("water");
    expect(facilityTypeOf("christian_anglican")).toBe("worship");
    expect(facilityTypeOf("muslim")).toBe("worship");
  });

  it("leaves out shops, kiosks, pitches and the like", () => {
    for (const osmClass of ["kiosk", "hairdresser", "pitch", "hotel", "christiania", "bus_stop"]) expect(facilityTypeOf(osmClass)).toBeNull();
  });

  it("shows health and emergency first, then adds types as you zoom in", () => {
    expect(facilityTypesAtZoom(8)).toEqual(["health", "emergency"]);
    expect(facilityTypesAtZoom(10)).toEqual(["health", "emergency", "education", "government", "market", "transport"]);
    expect(facilityTypesAtZoom(12)).toEqual([...FACILITY_TYPES]);
    expect(facilityTypesAtZoom(undefined)).toEqual([...FACILITY_TYPES]);
    expect(LAYER_FEATURE_LIMIT.infrastructure).toBe(5_000);
  });
});

describe("prepareInfrastructure", () => {
  const feature = (properties: Record<string, unknown>, geometry: unknown = point()) => ({
    properties,
    geometry: geometry as never,
  });

  it("keeps facilities with their type and raw class, and flags outlines", () => {
    const { rows, rejected } = prepareInfrastructure([
      feature({ osm_id: "1", fclass: "clinic", name: " Okrika Clinic " }),
      feature({ osm_id: "2", fclass: "school", name: "" }, square),
    ]);
    expect(rejected).toEqual({});
    expect(rows).toEqual([
      { osmId: "1", fromArea: false, name: "Okrika Clinic", facilityType: "health", osmClass: "clinic", shape: JSON.stringify(point()) },
      { osmId: "2", fromArea: true, name: null, facilityType: "education", osmClass: "school", shape: JSON.stringify(square) },
    ]);
  });

  it("treats a one-point MultiPoint (the clipped handover's points) as a point, not an outline", () => {
    const multiPoint = { type: "MultiPoint", coordinates: [[7.0, 4.8]] };
    const { rows } = prepareInfrastructure([feature({ osm_id: "3", fclass: "police" }, multiPoint)]);
    expect(rows).toEqual([
      { osmId: "3", fromArea: false, name: null, facilityType: "emergency", osmClass: "police", shape: JSON.stringify(multiPoint) },
    ]);
  });

  it("counts what it leaves out, by reason", () => {
    const { rows, rejected } = prepareInfrastructure([
      feature({ osm_id: "1", fclass: "kiosk" }),
      feature({ osm_id: "2", fclass: "hairdresser" }),
      feature({ fclass: "school" }),
      feature({ osm_id: "4" }),
      feature({ osm_id: "5", fclass: "school" }, null),
      feature({ osm_id: "6", fclass: "school", name: "x".repeat(201) }),
    ]);
    expect(rows).toEqual([]);
    expect(rejected).toEqual({
      [NOT_A_FACILITY]: 2,
      "no osm_id": 1,
      "no fclass": 1,
      "no shape": 1,
      "a text value is too long for its column": 1,
    });
  });

  it("keeps a point and an outline that share an OSM number, but not the same one twice", () => {
    const { rows, rejected } = prepareInfrastructure([
      feature({ osm_id: "7", fclass: "school" }),
      feature({ osm_id: "7", fclass: "school" }, square),
      feature({ osm_id: "7", fclass: "school" }, square),
    ]);
    expect(rows.map((row) => row.fromArea)).toEqual([false, true]);
    expect(rejected).toEqual({ "the same id appears more than once in the file": 1 });
  });
});

describe("MapLayerLoaderService: infrastructure", () => {
  const SOURCE = "40000000-0000-4000-8000-000000000009";
  const base: LoadRequest = { countryCode: "NGA", wardLevel: 3, dryRun: false };

  function build() {
    const store = new FakeLoadStore();
    store.tx.existingSourceIds.add(SOURCE);
    return { store, service: new MapLayerLoaderService(store, new InMemoryCountryRepository([makeCountry()])) };
  }

  async function extract(): Promise<Buffer> {
    const pois = await makeGeoPackage([
      { osm_id: "1", fclass: "hospital", name: "BMH", geom: point() },
      { osm_id: "2", fclass: "kiosk", geom: point() },
    ]);
    const pofwAreas = await makeGeoPackage([{ osm_id: "3", fclass: "christian", geom: square }], { table: "gis_osm_pofw_a_free_1_rivers" });
    const buildings = await makeGeoPackage([{ osm_id: "9", fclass: "building", geom: square }], { table: "gis_osm_buildings_a_free_1_rivers" });
    return Buffer.from(
      zipSync({
        "osm/gis_osm_pois_free_1_rivers.gpkg": pois,
        "osm/gis_osm_pofw_a_free_1_rivers.gpkg": pofwAreas,
        "osm/gis_osm_buildings_a_free_1_rivers.gpkg": buildings,
      }),
    );
  }

  it("loads each facility file of the extract against an existing source, linking wards at the ward level", async () => {
    const { store, service } = build();
    const report = await service.load({ ...base, infrastructure: { fileName: "osm.zip", buffer: await extract(), sourceId: SOURCE } });

    expect(report.layers.map((layer) => [layer.layer, layer.file, layer.featuresInFile, layer.inserted])).toEqual([
      ["infrastructure", "gis_osm_pofw_a_free_1_rivers.gpkg", 1, 1],
      ["infrastructure", "gis_osm_pois_free_1_rivers.gpkg", 2, 1],
    ]);
    expect(report.layers[1]!.rejected).toEqual({ [NOT_A_FACILITY]: 1 });
    expect(store.tx.infrastructure.flatMap((batch) => batch.rows.map((row) => [row.osmId, row.facilityType, row.fromArea]))).toEqual([
      ["3", "worship", true],
      ["1", "health", false],
    ]);
    expect(store.tx.infrastructure[0]!.context).toMatchObject({ countryCode: "NGA", sourceId: SOURCE, wardLevel: 3 });
    expect(store.tx.sources).toEqual([]);
    expect(store.committed).toBe(true);
  });

  it("refuses an extract with no facility files before the database is opened", async () => {
    const { store, service } = build();
    const roadsOnly = Buffer.from(zipSync({ "osm/gis_osm_roads_free_1_rivers.gpkg": await makeGeoPackage([]) }));
    const message = await validationMessageAsync(() =>
      service.load({ ...base, infrastructure: { fileName: "osm.zip", buffer: roadsOnly, sourceId: SOURCE } }),
    );
    expect(message).toMatch(/osm\.zip has no OpenStreetMap facility files/);
    expect(store.committed || store.rolledBack).toBe(false);
  });

  it("refuses an unknown source after reading the files, and keeps nothing", async () => {
    const store = new FakeLoadStore();
    const service = new MapLayerLoaderService(store, new InMemoryCountryRepository([makeCountry()]));
    const message = await validationMessageAsync(() =>
      extract().then((buffer) => service.load({ ...base, infrastructure: { fileName: "osm.zip", buffer, sourceId: SOURCE } })),
    );
    expect(message).toMatch(/No data source with id .* Add the infrastructure file's source/);
    expect(store.rolledBack).toBe(true);
  });
});

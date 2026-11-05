import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { NotFoundError, UnprovenDataError, ValidationError } from "../../src/common/errors/app-error";
import { FloodRiskService } from "../../src/modules/flood-risk/flood-risk.service";
import { utmConverter } from "../../src/modules/flood-risk/raster-projection";
import { asAuthUser, makeUser } from "../fakes";
import { InMemoryFloodRiskRepository, cellRectangle, makeArea, makeLayerRecord, ORIGIN, RecordingFloodRiskImports } from "../flood-risk-fakes";
import { InMemoryAdminUnitRepository, InMemoryCountryRepository, InMemoryDataSourceRepository, makeCountry, makeSource, makeUnit } from "../geo-fakes";
import { buildClassTiff, decodePalettePng } from "../raster-fixtures";

const admin = asAuthUser(makeUser({ role: "administrator" }));
const member = asAuthUser(makeUser());
const source = makeSource();

const WIDTH = 60;
const HEIGHT = 50;

/** Class 3 everywhere, a 10 x 10 block of class 5 in the north-west and a 10 x 10 block of class 1 in the south-east. */
function mapValues(): number[] {
  return Array.from({ length: WIDTH * HEIGHT }, (_, i) => {
    const col = i % WIDTH;
    const row = Math.floor(i / WIDTH);
    if (col < 10 && row < 10) return 5;
    if (col >= 50 && row >= 40) return 1;
    return 3;
  });
}

const upload = async (name = "flood_risk_map.tif") => ({
  originalName: name,
  buffer: await buildClassTiff({ width: WIDTH, height: HEIGHT, ...ORIGIN, values: mapValues(), nodata: -9999, float: true }),
});

function setup(options: { areas?: ReturnType<typeof makeArea>[]; country?: ReturnType<typeof makeCountry> } = {}) {
  const layers = new InMemoryFloodRiskRepository();
  layers.areas = options.areas ?? [];
  const imports = new RecordingFloodRiskImports();
  const countries = new InMemoryCountryRepository([options.country ?? makeCountry()]);
  const sources = new InMemoryDataSourceRepository([source]);
  const units = new InMemoryAdminUnitRepository([]);
  return { layers, imports, countries, sources, units, service: new FloodRiskService(layers, imports, countries, sources, units) };
}

const west = makeArea({ unitName: "West LGA", geometry: cellRectangle(0, 0, 30, 50) });
const east = makeArea({ unitName: "East LGA", geometry: cellRectangle(30, 0, 60, 50) });
const ward = makeArea({ unitName: "North-west ward", level: 3, levelName: "Ward", parentName: "West LGA", geometry: cellRectangle(0, 0, 10, 10) });

async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe("importing the flood risk map", () => {
  const input = { countryCode: "NGA", sourceId: source.id };

  it("refuses a map whose source isn't recorded", async () => {
    const { service } = setup({ areas: [west] });
    expect(await failure(service.startImport(await upload(), { ...input, sourceId: "20000000-0000-4000-8000-0000000000ff" }, admin))).toBeInstanceOf(UnprovenDataError);
  });

  it("refuses a country that doesn't exist", async () => {
    const { service } = setup({ areas: [west] });
    const error = (await failure(service.startImport(await upload(), { ...input, countryCode: "XXX" }, admin))) as ValidationError;
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.errors?.[0]?.field).toBe("countryCode");
  });

  it("asks for the LGAs first, since the map is measured per LGA and ward", async () => {
    const { service } = setup({ areas: [] });
    const error = (await failure(service.startImport(await upload(), input, admin))) as ValidationError;
    expect(error.errors?.[0]?.message).toMatch(/no LGAs live yet/);
  });

  it("refuses a map that lies outside the country's bounding box", async () => {
    const { service, imports } = setup({ areas: [west], country: makeCountry({ bbox: [2.5, 4.0, 5.0, 14.0] }) });
    const error = (await failure(service.startImport(await upload(), input, admin))) as ValidationError;
    expect(error.errors?.[0]?.message).toMatch(/outside Nigeria's bounding box/);
    expect(imports.created).toBeUndefined();
  });

  it("refuses a map that does not line up with the boundaries", async () => {
    // The areas are 60 km away from the map, so every classified cell is outside every LGA.
    const { service, imports } = setup({ areas: [makeArea({ geometry: cellRectangle(600, 600, 700, 700) })] });
    const error = (await failure(service.startImport(await upload(), input, admin))) as ValidationError;
    expect(error.errors?.[0]?.message).toMatch(/100% of the map's classified cells lie outside every LGA/);
    expect(imports.created).toBeUndefined();
  });

  it("measures every LGA and ward, and stages one row for each with how its cells divide into classes", async () => {
    const { service, imports } = setup({ areas: [west, east, ward] });
    const run = await service.startImport(await upload(), input, admin);

    expect(run).toMatchObject({ target: "flood_risk_layers", fileType: "geotiff", rowCount: 3, passedCount: 3, errorCount: 0 });
    const { rows, run: staged, checks } = imports.created!;
    expect(checks).toBeNull(); // no shapes to check: the rows are counts
    expect(staged).toMatchObject({ target: "flood_risk_layers", fileType: "geotiff", sourceId: source.id, createdBy: admin.id });
    expect(staged.options).toEqual({ countryCode: "NGA", dataType: "DERIVED", title: "flood_risk_map" });

    const byName = Object.fromEntries(rows.map((row) => [row.fields.unitName, row.fields]));
    expect(byName["West LGA"]).toMatchObject({ classCells: [0, 0, 1400, 0, 100], totalCells: 1500, percentHigh: 6.67 });
    expect(byName["East LGA"]).toMatchObject({ classCells: [100, 0, 1400, 0, 0], totalCells: 1500, percentHigh: 0, meanClass: 2.87 });
    expect(byName["North-west ward"]).toMatchObject({ classCells: [0, 0, 0, 0, 100], percentHigh: 100, meanClass: 5, parentName: "West LGA", levelName: "Ward" });
    expect(rows.map((row) => row.rowNumber)).toEqual([1, 2, 3]);
    expect(rows.every((row) => row.errors.length === 0)).toBe(true);
  });

  it("says what it read, and warns about an area the map doesn't reach", async () => {
    const stray = makeArea({ unitName: "Stray ward", level: 3, levelName: "Ward", geometry: cellRectangle(300, 300, 310, 310) });
    const { service, imports } = setup({ areas: [west, east, stray] });
    await service.startImport(await upload(), input, admin);

    const { run, rows } = imports.created!;
    expect(run.warnings[0]).toBe("Read a 60 x 50 map of 100 m cells (EPSG:32632): 30 km2 classified, measured in 3 areas.");
    expect(rows.find((row) => row.fields.unitName === "Stray ward")?.warnings).toEqual([expect.stringMatching(/no data inside this area/)]);
    // A ward with no data still passes: it is a note for the reviewer, not a reason to refuse the map.
    expect(rows.every((row) => row.errors.length === 0)).toBe(true);
  });

  it("stores the map's picture and class grid with the run, ready to promote", async () => {
    const { service, imports } = setup({ areas: [west, east] });
    await service.startImport(await upload(), input, admin);

    const layer = imports.created!.layer!;
    expect(layer).toMatchObject({ countryCode: "NGA", sourceId: source.id, sourceCrs: "EPSG:32632", cellSize: 100, gridWidth: WIDTH, gridHeight: HEIGHT, createdBy: admin.id });
    expect(layer.classCells).toEqual([100, 0, 2800, 0, 100]);
    const grid = gunzipSync(layer.gridGz);
    expect(grid.length).toBe(WIDTH * HEIGHT);
    expect(grid[0]).toBe(5);
    expect(grid[WIDTH * HEIGHT - 1]).toBe(1);
    const png = decodePalettePng(layer.image.png);
    expect([png.width, png.height]).toEqual([layer.image.width, layer.image.height]);
    expect(layer.image.west).toBeLessThan(layer.image.east);
    expect(layer.image.south).toBeLessThan(layer.image.north);
  });

  it("titles the map from the file name unless the administrator gave one", async () => {
    const first = setup({ areas: [west] });
    await first.service.startImport(await upload("rivers_flood_risk_2026.tif"), input, admin);
    expect(first.imports.created!.layer!.title).toBe("rivers_flood_risk_2026");

    const second = setup({ areas: [west] });
    await second.service.startImport(await upload(), { ...input, title: "Rivers State flood risk, 2026" }, admin);
    expect(second.imports.created!.layer!.title).toBe("Rivers State flood risk, 2026");
  });
});

describe("reading the map back", () => {
  it("has no live map until one is promoted (so the screen shows no toggle for it)", async () => {
    const { service } = setup();
    expect(await service.live("NGA")).toBeNull();
  });

  it("describes the live map for the legend, the credit line and the picture's corners", async () => {
    const { service, layers } = setup();
    layers.layers = [makeLayerRecord()];
    const dto = (await service.live("NGA"))!;
    expect(dto).toMatchObject({ status: "live", dataType: "DERIVED", cellSizeMetres: 100, sourceCrs: "EPSG:32632", totalAreaKm2: 15 });
    // Mapbox's order: top-left, top-right, bottom-right, bottom-left, each [longitude, latitude].
    expect(dto.coordinates).toEqual([[6.74, 4.71], [6.76, 4.71], [6.76, 4.69], [6.74, 4.69]]);
    expect(dto.classes.map((c) => [c.label, c.color, c.areaKm2])).toEqual([
      ["Very low", "#1a9641", 1],
      ["Low", "#a6d96a", 2],
      ["Moderate", "#ffffbf", 3],
      ["High", "#fdae61", 4],
      ["Very high", "#d7191c", 5],
    ]);
    expect(dto.source).toMatchObject({ provider: "geoBoundaries", license: "CC BY 4.0" });
  });

  it("finds the map an import staged, for the review screen", async () => {
    const { service, layers } = setup();
    layers.layers = [makeLayerRecord({ status: "staged", promotedAt: null })];
    expect((await service.forRun("30000000-0000-4000-8000-000000000001")).status).toBe("staged");
    expect(await failure(service.forRun("30000000-0000-4000-8000-0000000000ff"))).toBeInstanceOf(NotFoundError);
  });

  it("shows the live picture to anyone signed in, but a staged or retired one only to administrators", async () => {
    const { service, layers } = setup();
    const live = makeLayerRecord();
    const staged = makeLayerRecord({ id: "50000000-0000-4000-8000-000000000002", status: "staged", importRunId: null });
    layers.layers = [live, staged];
    layers.images.set(live.id, Buffer.from("png-live"));
    layers.images.set(staged.id, Buffer.from("png-staged"));

    expect((await service.image(live.id, member)).toString()).toBe("png-live");
    expect(await failure(service.image(staged.id, member))).toBeInstanceOf(NotFoundError);
    expect((await service.image(staged.id, admin)).toString()).toBe("png-staged");
    expect(await failure(service.image("50000000-0000-4000-8000-0000000000ff", admin))).toBeInstanceOf(NotFoundError);
  });

  it("ranks an area among those of its level by how much of it is high or very high risk", async () => {
    const { layers, imports, countries, sources } = setup();
    const live = makeLayerRecord();
    layers.layers = [live];
    const [a, b, c] = ["A", "B", "C"].map((name) => makeUnit({ unitName: name, level: 2 }));
    const units = new InMemoryAdminUnitRepository([a!, b!, c!]);
    layers.figures = [
      { layerId: live.id, level: 2, adminUnitId: a!.id, classCells: [0, 0, 0, 0, 10] },
      { layerId: live.id, level: 2, adminUnitId: b!.id, classCells: [10, 0, 0, 0, 0] },
      { layerId: live.id, level: 2, adminUnitId: c!.id, classCells: [0, 0, 5, 5, 0] },
    ];
    const service = new FloodRiskService(layers, imports, countries, sources, units);

    const first = (await service.area(a!.id))!;
    expect(first.rank).toEqual({ position: 1, of: 3 });
    expect(first.percentHighOrVeryHigh).toBe(100);
    expect(first.meanClass).toBe(5);
    expect(first.totalAreaKm2).toBe(0.1);
    expect(first.classes.at(-1)).toMatchObject({ label: "Very high", percent: 100, areaKm2: 0.1 });
    expect((await service.area(c!.id))!.rank).toEqual({ position: 2, of: 3 });
    expect((await service.area(b!.id))!.rank).toEqual({ position: 3, of: 3 });
  });

  it("has no figures for an area that wasn't measured, or when there is no live map", async () => {
    const { layers, imports, countries, sources } = setup();
    const unit = makeUnit({ level: 2 });
    const service = new FloodRiskService(layers, imports, countries, sources, new InMemoryAdminUnitRepository([unit]));
    expect(await service.area(unit.id)).toBeNull(); // no live map
    layers.layers = [makeLayerRecord()];
    expect(await service.area(unit.id)).toBeNull(); // live map, but this area has no figures
    expect(await failure(service.area("10000000-0000-4000-8000-0000000000ff"))).toBeInstanceOf(NotFoundError);
  });

  it("says which class lies under a point, and none beyond the map's edge", async () => {
    const { service, layers } = setup();
    const live = makeLayerRecord();
    layers.layers = [live];
    layers.grids.set(live.id, gzipSync(Uint8Array.from(mapValues())));
    const converter = utmConverter(32632);
    const centreOf = (col: number, row: number) => {
      const [lon, lat] = converter.toLonLat([ORIGIN.originE + (col + 0.5) * 100, ORIGIN.originN - (row + 0.5) * 100]);
      return { lon, lat, countryCode: "NGA" };
    };

    expect((await service.at(centreOf(3, 3)))!.class).toEqual({ value: 5, label: "Very high", color: "#d7191c" });
    expect((await service.at(centreOf(25, 25)))!.class?.label).toBe("Moderate");
    expect((await service.at(centreOf(55, 45)))!.class?.label).toBe("Very low");
    expect((await service.at(centreOf(100, 100)))!.class).toBeNull();
    expect(await setup().service.at(centreOf(3, 3))).toBeNull(); // no live map at all
  });
});

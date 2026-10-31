import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../src/common/errors/app-error";
import type { GeoJsonLayerQuery } from "../../src/modules/admin-units/admin-unit.types";
import { AdminUnitService } from "../../src/modules/admin-units/admin-unit.service";
import type { MapLayerInfoDto } from "../../src/modules/map-layers/map-layer.types";
import { PUBLIC_CACHE_TTL_MS, PublicService, unionBBox } from "../../src/modules/public/public.service";
import type { AreaLevelSummary, PublicCommunityHit, RainfallCoverageSummary } from "../../src/modules/public/public.types";
import { RainfallService } from "../../src/modules/rainfall/rainfall.service";
import type { RainfallMonthRow } from "../../src/modules/rainfall/rainfall.types";
import { InMemoryAdminUnitRepository, InMemoryDataSourceRepository, InMemoryRainfallRepository, makeSource, makeUnit } from "../geo-fakes";

const boundaries = makeSource({ id: "20000000-0000-4000-8000-000000000001", provider: "geoBoundaries", datasetName: "gbOpen NGA ADM2" });
const chirps = makeSource({ id: "20000000-0000-4000-8000-000000000009", provider: "Climate Hazards Center", datasetName: "CHIRPS v2.0" });
const osm = makeSource({ id: "20000000-0000-4000-8000-000000000010", provider: "OpenStreetMap", datasetName: "Geofabrik Nigeria" });

const rivers = makeUnit({ level: 1, levelName: "State", unitName: "Rivers", unitCode: "NG-RI" });
const obio = makeUnit({ level: 2, levelName: "LGA", unitName: "Obio/Akpor", parentId: rivers.id });
const rumuola = makeUnit({ level: 3, levelName: "Ward", unitName: "Rumuola", parentId: obio.id });
const etche = makeUnit({ level: 2, levelName: "LGA", unitName: "Etche", parentId: rivers.id });

/** The area fake plus the landing page's level summary, and a record of the outline's query. */
class StatsUnits extends InMemoryAdminUnitRepository {
  outlineQueries: GeoJsonLayerQuery[] = [];
  summariseCalls = 0;

  async summariseLevels(): Promise<AreaLevelSummary[]> {
    this.summariseCalls += 1;
    return [
      { level: 1, levelName: "State", count: 1, sourceIds: [boundaries.id] },
      { level: 2, levelName: "LGA", count: 23, sourceIds: [boundaries.id] },
    ];
  }

  override async findGeoJson(query?: GeoJsonLayerQuery) {
    if (query) this.outlineQueries.push(query);
    return super.findGeoJson();
  }
}

const layers: MapLayerInfoDto[] = [
  { id: "roads", label: "Roads", featureCount: 41_000, sources: [{ ...osm, createdAt: osm.createdAt.toISOString() }] },
  { id: "buildings", label: "Buildings", featureCount: 0, sources: [] },
];

const coverage: RainfallCoverageSummary = { firstMonth: "2016-01", lastMonth: "2026-08", areaCount: 23, sourceIds: [chirps.id] };

const month = (yearMonth: string, rainfallMm: number | null): RainfallMonthRow => ({ yearMonth, rainfallMm, dataType: "OBSERVED", sourceId: chirps.id });

function setup(options: { coverage?: RainfallCoverageSummary | null; communities?: PublicCommunityHit[] } = {}) {
  let time = Date.parse("2026-10-30T09:00:00.000Z");
  const units = new StatsUnits([rivers, obio, rumuola, etche]);
  const sources = new InMemoryDataSourceRepository([boundaries, chirps, osm]);
  const rainfallRows = new InMemoryRainfallRepository([], new Map([[obio.id, [month("2026-07", 420.1), month("2026-08", 304.5)]]]));
  const catalog = { calls: 0 };
  const searches: string[] = [];
  const service = new PublicService({
    units,
    areas: new AdminUnitService(units, sources),
    layers: {
      catalog: async () => {
        catalog.calls += 1;
        return layers;
      },
    },
    rainfall: new RainfallService(rainfallRows, units, sources),
    coverage: { findCoverage: async () => (options.coverage === undefined ? coverage : options.coverage) },
    communities: {
      searchByName: async (q) => {
        searches.push(q);
        return options.communities ?? [];
      },
    },
    sources,
    alerts: { list: async () => [] },
    floodReports: { publishedSince: async () => [] },
      floodExtents: { publicActive: async () => [] },
    now: () => time,
  });
  return { service, units, catalog, searches, advance: (ms: number) => (time += ms) };
}

describe("PublicService.overview", () => {
  it("counts each level and layer, gives the rainfall span, and credits every source once", async () => {
    const { service } = setup();
    const overview = await service.overview();

    expect(overview.states).toEqual([{ id: rivers.id, countryCode: "NGA", unitName: "Rivers", levelName: "State" }]);
    expect(overview.areas).toEqual([
      { level: 1, levelName: "State", count: 1 },
      { level: 2, levelName: "LGA", count: 23 },
    ]);
    expect(overview.layers).toEqual([
      { id: "roads", label: "Roads", featureCount: 41_000 },
      { id: "buildings", label: "Buildings", featureCount: 0 },
    ]);
    expect(overview.rainfall).toEqual({ firstMonth: "2016-01", lastMonth: "2026-08", areaCount: 23 });
    expect(overview.sources.map((s) => s.provider)).toEqual(["Climate Hazards Center", "geoBoundaries", "OpenStreetMap"]);
    expect(overview.generatedAt).toBe("2026-10-30T09:00:00.000Z");
  });

  it("never carries internal source fields such as notes or who created it", async () => {
    const { sources } = await setup().service.overview();
    for (const source of sources) expect(Object.keys(source).sort()).toEqual(["datasetName", "id", "license", "provider", "url"]);
  });

  it("says there is no rainfall rather than inventing a span", async () => {
    const { rainfall } = await setup({ coverage: null }).service.overview();
    expect(rainfall).toBeNull();
  });

  it("reuses the overview for five minutes, then reads it again", async () => {
    const { service, units, catalog, advance } = setup();
    await service.overview();
    await service.overview();
    expect(units.summariseCalls).toBe(1);
    expect(catalog.calls).toBe(1);

    advance(PUBLIC_CACHE_TTL_MS + 1);
    await service.overview();
    expect(units.summariseCalls).toBe(2);
  });
});

describe("PublicService.outline", () => {
  it("asks for the simplified LGAs over the extent of the states", async () => {
    const { service, units } = setup();
    const outline = await service.outline();
    expect(outline.bbox).toEqual([7, 4.8, 7.01, 4.81]);
    expect(units.outlineQueries).toEqual([{ level: 2, bbox: [7, 4.8, 7.01, 4.81], zoom: 7 }]);
  });

  it("is empty before any state is loaded", async () => {
    const units = new StatsUnits([]);
    const sources = new InMemoryDataSourceRepository();
    const service = new PublicService({
      units,
      areas: new AdminUnitService(units, sources),
      layers: { catalog: async () => [] },
      rainfall: new RainfallService(new InMemoryRainfallRepository(), units, sources),
      coverage: { findCoverage: async () => null },
      communities: { searchByName: async () => [] },
      sources,
      alerts: { list: async () => [] },
      floodReports: { publishedSince: async () => [] },
      floodExtents: { publicActive: async () => [] },
    });
    await expect(service.outline()).resolves.toEqual({ bbox: null, areas: { type: "FeatureCollection", features: [] } });
    expect(units.outlineQueries).toEqual([]);
  });
});

describe("PublicService.search", () => {
  it("names each matching area with its parent, and passes the search to the communities", async () => {
    const hit: PublicCommunityHit = { id: "c1", name: "Rumuokoro", isPrimary: true, point: [7.0, 4.87] };
    const { service, searches } = setup({ communities: [hit] });
    const result = await service.search({ q: "rumu" });

    expect(result.areas).toEqual([expect.objectContaining({ id: rumuola.id, unitName: "Rumuola", levelName: "Ward", parentName: "Obio/Akpor" })]);
    expect(result.communities).toEqual([hit]);
    expect(searches).toEqual(["rumu"]);
  });

  it("gives a top-level area no parent name", async () => {
    const { areas } = await setup().service.search({ q: "rivers" });
    expect(areas).toEqual([expect.objectContaining({ unitName: "Rivers", parentName: null })]);
  });
});

describe("PublicService.area", () => {
  it("returns the area, the areas above it nearest first, and its own rainfall", async () => {
    const result = await setup().service.area(obio.id);
    expect(result.area).toMatchObject({ id: obio.id, unitName: "Obio/Akpor", parentId: rivers.id, centroid: [7.005, 4.805] });
    expect(result.parents.map((p) => p.unitName)).toEqual(["Rivers"]);
    expect(result.rainfall?.adminUnit.id).toBe(obio.id);
    expect(result.rainfall?.months).toHaveLength(2);
  });

  it("gives a ward its LGA's rainfall, and says whose it is", async () => {
    const result = await setup().service.area(rumuola.id);
    expect(result.parents.map((p) => p.unitName)).toEqual(["Obio/Akpor", "Rivers"]);
    expect(result.rainfall?.adminUnit.unitName).toBe("Obio/Akpor");
  });

  it("gives null rainfall when no area in the chain has any", async () => {
    const result = await setup().service.area(etche.id);
    expect(result.rainfall).toBeNull();
  });

  it("404s an unknown area", async () => {
    await expect(setup().service.area("99999999-9999-4999-8999-999999999999")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("PublicService.locate", () => {
  it("names the state, LGA and ward when the ward is filed under that LGA", async () => {
    const { service, units } = setup();
    units.containing = [rivers, obio, rumuola];
    const result = await service.locate({ lon: 7.0, lat: 4.82 });
    expect(result.units.map((u) => u.unitName)).toEqual(["Rivers", "Obio/Akpor", "Rumuola"]);
  });

  it("leaves out a ward that belongs to a different LGA than the one containing the point", async () => {
    const { service, units } = setup();
    units.containing = [rivers, etche, rumuola];
    const result = await service.locate({ lon: 7.0, lat: 4.82 });
    expect(result.units.map((u) => u.unitName)).toEqual(["Rivers", "Etche"]);
  });
});

describe("unionBBox", () => {
  it("is the smallest box around every box, or null for none", () => {
    expect(unionBBox([[6.5, 4.3, 7.0, 5.0], [6.9, 4.4, 7.6, 5.7]])).toEqual([6.5, 4.3, 7.6, 5.7]);
    expect(unionBBox([])).toBeNull();
  });
});

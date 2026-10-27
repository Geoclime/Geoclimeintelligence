import { describe, expect, it } from "vitest";
import { MapLayerService } from "../../src/modules/map-layers/map-layer.service";
import { InMemoryDataSourceRepository, makeSource } from "../geo-fakes";
import { RecordingLayerRepository } from "../map-layer-fakes";

const osm = makeSource({ id: "30000000-0000-4000-8000-000000000001", provider: "OpenStreetMap contributors via HDX", license: "ODbL" });
const grid3 = makeSource({ id: "30000000-0000-4000-8000-000000000002", provider: "GRID3", license: "CC BY 4.0" });

function build(sources = [osm, grid3]) {
  const roads = new RecordingLayerRepository({ featureCount: 47_507, sourceIds: [osm.id] });
  const waterways = new RecordingLayerRepository({ featureCount: 4_033, sourceIds: [osm.id] });
  const settlements = new RecordingLayerRepository({ featureCount: 1_149, sourceIds: [grid3.id] });
  const service = new MapLayerService(roads, waterways, settlements, new InMemoryDataSourceRepository(sources));
  return { service, roads, waterways, settlements };
}

describe("MapLayerService.catalog", () => {
  it("lists each layer with its size and the sources behind it", async () => {
    const catalog = await build().service.catalog();
    expect(catalog.map((layer) => [layer.id, layer.label, layer.featureCount])).toEqual([
      ["roads", "Roads", 47_507],
      ["waterways", "Waterways", 4_033],
      ["settlements", "Settlements", 1_149],
    ]);
    expect(catalog[0]!.sources).toEqual([
      expect.objectContaining({ id: osm.id, provider: "OpenStreetMap contributors via HDX", license: "ODbL", downloadedOn: "2026-09-22" }),
    ]);
    expect(catalog[2]!.sources[0]).toMatchObject({ provider: "GRID3", license: "CC BY 4.0" });
  });

  it("shows an empty layer as empty, with no sources, instead of failing", async () => {
    const { service } = build();
    const empty = new MapLayerService(
      new RecordingLayerRepository(),
      new RecordingLayerRepository(),
      new RecordingLayerRepository(),
      new InMemoryDataSourceRepository([]),
    );
    expect((await empty.catalog()).every((layer) => layer.featureCount === 0 && layer.sources.length === 0)).toBe(true);
    expect(await service.catalog()).toHaveLength(3);
  });

  it("skips a source id that no longer resolves", async () => {
    const catalog = await build([grid3]).service.catalog();
    expect(catalog[0]!.sources).toEqual([]);
    expect(catalog[2]!.sources).toHaveLength(1);
  });
});

describe("MapLayerService map layers", () => {
  const query = { bbox: [6.9, 4.7, 7.1, 4.9] as [number, number, number, number], zoom: 12 };

  it("hands each layer's repository the visible area and the zoom", async () => {
    const { service, roads, waterways, settlements } = build();
    await service.roadsGeoJson(query);
    await service.waterwaysGeoJson(query);
    await service.settlementsGeoJson({ bbox: query.bbox });
    expect(roads.queries).toEqual([query]);
    expect(waterways.queries).toEqual([query]);
    expect(settlements.queries).toEqual([{ bbox: query.bbox }]);
  });

  it("passes the truncated flag through so the screen can say 'zoom in for more'", async () => {
    const { service } = build();
    expect((await service.roadsGeoJson(query)).truncated).toBe(false);
  });
});

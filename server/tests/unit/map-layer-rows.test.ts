import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/common/errors/app-error";
import {
  parseLayerGeoJson,
  prepareRoads,
  prepareSettlements,
  prepareWaterways,
  text,
  type LayerFeature,
} from "../../src/modules/map-layers/map-layer-rows";
import { validationMessage } from "../map-layer-fakes";

const line = { type: "LineString" as const, coordinates: [[7, 4.8], [7.01, 4.81]] };
const point = { type: "Point" as const, coordinates: [7.29, 4.6] };

const feature = (properties: Record<string, unknown>, geometry: LayerFeature["geometry"] = line): LayerFeature => ({
  properties,
  geometry,
});

const roadProps = { osm_id: "way/1", name: "Aba Road", road_type: "primary", surface: "asphalt", bridge: "yes" };

function geojson(features: unknown[], crsName?: string): Buffer {
  const body: Record<string, unknown> = { type: "FeatureCollection", features };
  if (crsName) body.crs = { type: "name", properties: { name: crsName } };
  return Buffer.from(JSON.stringify(body));
}

describe("parseLayerGeoJson", () => {
  it("reads every feature, with no row cap", () => {
    const many = Array.from({ length: 25_000 }, (_, i) => ({ type: "Feature", properties: { osm_id: `way/${i}` }, geometry: line }));
    expect(parseLayerGeoJson(geojson(many), "roads.geojson")).toHaveLength(25_000);
  });

  it("accepts the WGS84 spellings real files use, and a file with no CRS", () => {
    expect(() => parseLayerGeoJson(geojson([], "urn:ogc:def:crs:OGC:1.3:CRS84"), "a.geojson")).not.toThrow();
    expect(() => parseLayerGeoJson(geojson([], "EPSG:4326"), "a.geojson")).not.toThrow();
    expect(() => parseLayerGeoJson(geojson([]), "a.geojson")).not.toThrow();
  });

  it("refuses any other CRS instead of guessing (rule 7)", () => {
    expect(() => parseLayerGeoJson(geojson([], "EPSG:26331"), "utm.geojson")).toThrow(ValidationError);
  });

  it("refuses files that are not a FeatureCollection", () => {
    expect(validationMessage(() => parseLayerGeoJson(Buffer.from("not json"), "bad.geojson"))).toMatch(/not valid JSON/);
    expect(validationMessage(() => parseLayerGeoJson(Buffer.from('{"type":"Feature"}'), "one.geojson"))).toMatch(/FeatureCollection/);
  });

  it("keeps a feature with no usable shape, so the caller can reject it by name", () => {
    const [kept] = parseLayerGeoJson(geojson([{ type: "Feature", properties: { osm_id: "way/9" }, geometry: null }]), "a.geojson");
    expect(kept).toEqual({ properties: { osm_id: "way/9" }, geometry: null });
  });
});

describe("text", () => {
  it("trims, and treats blank, single-space and missing values as no value", () => {
    expect(text("  Bonny ")).toBe("Bonny");
    expect(text(" ")).toBeNull();
    expect(text("")).toBeNull();
    expect(text(null)).toBeNull();
    expect(text(undefined)).toBeNull();
    expect(text({ nested: true })).toBeNull();
    expect(text(12)).toBe("12");
  });
});

describe("prepareRoads", () => {
  it("builds a row with its importance rank and bridge flag", () => {
    const { rows, rejected } = prepareRoads([feature(roadProps)]);
    expect(rejected).toEqual({});
    expect(rows[0]).toMatchObject({
      osmId: "way/1",
      name: "Aba Road",
      roadClass: "primary",
      classRank: 2,
      surface: "asphalt",
      isBridge: true,
      oneway: null,
    });
    expect(JSON.parse(rows[0]!.shape)).toEqual(line);
  });

  it("counts, by reason, the features it cannot store", () => {
    const { rows, rejected } = prepareRoads([
      feature(roadProps),
      feature({ ...roadProps, osm_id: undefined }),
      feature({ ...roadProps, osm_id: "way/2", road_type: " " }),
      feature({ ...roadProps, osm_id: "way/3" }, null),
      feature({ ...roadProps, osm_id: "way/4", name: "x".repeat(201) }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rejected).toEqual({
      "no osm_id": 1,
      "no road type": 1,
      "no shape": 1,
      "a text value is too long for its column": 1,
    });
  });

  it("keeps the first of two features with the same id and says so", () => {
    const { rows, rejected } = prepareRoads([feature(roadProps), feature({ ...roadProps, name: "Other" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Aba Road");
    expect(rejected).toEqual({ "the same id appears more than once in the file": 1 });
  });
});

describe("prepareWaterways", () => {
  const props = { osm_id: "way/7", name: null, waterway_type: "stream", water_class: "creek", class_basis: "tag" };

  it("keeps the raw OSM tag beside the data team's river/creek class", () => {
    const { rows } = prepareWaterways([feature(props)]);
    expect(rows[0]).toMatchObject({ waterwayType: "stream", waterClass: "creek", classBasis: "tag", name: null });
  });

  it("refuses a class the database would not accept", () => {
    const { rows, rejected } = prepareWaterways([feature({ ...props, water_class: "stream" })]);
    expect(rows).toEqual([]);
    expect(rejected).toEqual({ "water_class is not river, creek or other": 1 });
  });

  it("needs a class_basis, so how a class was decided is never lost", () => {
    expect(prepareWaterways([feature({ ...props, class_basis: " " })]).rejected).toEqual({ "no class_basis": 1 });
  });
});

describe("prepareSettlements", () => {
  const props = {
    set_id: "12161630",
    set_name: "Bon Nna",
    wardcode: "RVSKPR14",
    is_primary: " ",
    set_altnam: " ",
    source: "OSGOF",
  };

  it("reads GRID3's blank markers as no value and 'Yes' as primary", () => {
    const { rows } = prepareSettlements([feature(props, point), feature({ ...props, set_id: "2", is_primary: "Yes" }, point)]);
    expect(rows.map((row) => row.isPrimary)).toEqual([false, true]);
    expect(rows[0]).toMatchObject({ setId: "12161630", wardCode: "RVSKPR14", name: "Bon Nna", dataOrigin: "OSGOF" });
  });

  it("needs an id, a name, a ward code and a shape", () => {
    const { rows, rejected } = prepareSettlements([
      feature({ ...props, set_id: " " }, point),
      feature({ ...props, set_id: "3", set_name: null }, point),
      feature({ ...props, set_id: "4", wardcode: "" }, point),
      feature({ ...props, set_id: "5" }, null),
    ]);
    expect(rows).toEqual([]);
    expect(rejected).toEqual({ "no set_id": 1, "no settlement name": 1, "no ward code": 1, "no shape": 1 });
  });

  it("allows the same name in different wards, since set_id is the key", () => {
    const { rows } = prepareSettlements([
      feature(props, point),
      feature({ ...props, set_id: "99", wardcode: "RVSOTHER01" }, point),
    ]);
    expect(rows).toHaveLength(2);
  });
});

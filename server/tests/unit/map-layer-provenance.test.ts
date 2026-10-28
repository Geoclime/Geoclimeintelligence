import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/common/errors/app-error";
import {
  findEntry,
  openLayerZip,
  parseProvenance,
  sourceFromEntry,
  type ProvenanceEntry,
} from "../../src/modules/map-layers/map-layer-provenance";
import { validationMessage } from "../map-layer-fakes";

const roads: ProvenanceEntry = {
  file: "rivers_roads.geojson",
  layer: "roads",
  source: "HDX dataset 'Roads of Nigeria' (OpenStreetMap contributors)",
  source_url: "https://data.humdata.org/dataset/hotosm_nga_roads",
  resource: "Roads (OSM), Shapefile",
  licence: "Open Database License (ODC-ODbL)",
  download_date_utc: "2026-10-27",
  source_last_modified: "2026-10-10",
};

const clip: ProvenanceEntry = {
  ...roads,
  file: "(boundary used for clipping, not delivered)",
  layer: "state_boundary",
  source: "geoBoundaries gbOpen NGA ADM1 (GRID3)",
  licence: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
};

describe("sourceFromEntry", () => {
  it("splits an HDX title into provider and dataset, and keeps the licence and date as written", () => {
    expect(sourceFromEntry(roads, clip)).toEqual({
      provider: "OpenStreetMap contributors via HDX",
      datasetName: "Roads of Nigeria (HDX)",
      url: "https://data.humdata.org/dataset/hotosm_nga_roads",
      license: "Open Database License (ODC-ODbL)",
      downloadedOn: "2026-10-27",
      notes:
        "Resource: Roads (OSM), Shapefile. Source last updated: 2026-10-10. " +
        "Clipped to Rivers State with geoBoundaries gbOpen NGA ADM1 (GRID3) (Creative Commons Attribution 4.0 International (CC BY 4.0)).",
    });
  });

  it("keeps any other wording whole instead of guessing at it", () => {
    const source = sourceFromEntry({ ...roads, source: "GRID3 Nigeria roads" }, null);
    expect(source.provider).toBe("GRID3 Nigeria roads");
    expect(source.datasetName).toBe("GRID3 Nigeria roads");
    expect(source.notes).not.toContain("Clipped");
  });

  it("gives a dataset's lines and areas identical notes, so they share one source row", () => {
    const lines = { ...roads, file: "w.geojson", layer: "waterways", resource: "Waterways (OSM), Shapefile" };
    const areas = { ...lines, file: "p.geojson", layer: "waterway_polygons" };
    expect(sourceFromEntry(lines, clip)).toEqual(sourceFromEntry(areas, clip));
  });

  it("stops the load when the licence, date or URL is missing", () => {
    expect(validationMessage(() => sourceFromEntry({ ...roads, licence: "" }, null))).toMatch(/a licence/);
    expect(validationMessage(() => sourceFromEntry({ ...roads, download_date_utc: "27/10/2026" }, null))).toMatch(/download date/);
    expect(validationMessage(() => sourceFromEntry({ ...roads, source_url: "data.humdata.org" }, null))).toMatch(/source URL/);
  });
});

describe("parseProvenance and findEntry", () => {
  it("reads the data team's provenance.json shape, ignoring fields it does not use", () => {
    const entries = parseProvenance(JSON.stringify([{ ...roads, features_in_output: 47507, crs: "EPSG:4326 (WGS84)" }]));
    expect(findEntry(entries, "roads").file).toBe("rivers_roads.geojson");
  });

  it("refuses a file that is not JSON or not a list of entries", () => {
    expect(() => parseProvenance("nope")).toThrow(ValidationError);
    expect(() => parseProvenance('{"file":"x"}')).toThrow(ValidationError);
  });

  it("names the layer that has no recorded source", () => {
    expect(validationMessage(() => findEntry([roads], "waterways"))).toMatch(/"waterways" layer/);
  });
});

describe("openLayerZip", () => {
  const zipOf = (files: Record<string, string>) =>
    Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name, body]) => [name, strToU8(body)]))));

  it("finds provenance.json and the layer files, even inside a folder", () => {
    const zip = openLayerZip(zipOf({ "pack/provenance.json": JSON.stringify([roads]), "pack/rivers_roads.geojson": "{}", "notes.txt": "ignored" }));
    expect(zip.entries).toHaveLength(1);
    expect(zip.read("rivers_roads.geojson").toString()).toBe("{}");
  });

  it("refuses a zip with no provenance.json: nothing in it could be traced", () => {
    expect(validationMessage(() => openLayerZip(zipOf({ "rivers_roads.geojson": "{}" })))).toMatch(/no provenance\.json/);
  });

  it("names a file the provenance lists but the zip lacks", () => {
    const zip = openLayerZip(zipOf({ "provenance.json": JSON.stringify([roads]) }));
    expect(validationMessage(() => zip.read("rivers_roads.geojson"))).toMatch(/no rivers_roads\.geojson/);
  });

  it("refuses something that is not a zip", () => {
    expect(() => openLayerZip(Buffer.from("not a zip"))).toThrow(ValidationError);
  });
});

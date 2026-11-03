import { describe, expect, it } from "vitest";
import type { FloodRiskLayer } from "../types/flood-risk.types";
import { classShare, EMPTY_IMAGE, floodRiskLegend, floodRiskNote, PARKED_CORNERS } from "./flood-risk";

const layer: FloodRiskLayer = {
  id: "50000000-0000-4000-8000-000000000001",
  countryCode: "NGA",
  status: "live",
  dataType: "DERIVED",
  title: "flood_risk_map",
  coordinates: [[6.39, 5.73], [7.59, 5.73], [7.59, 4.32], [6.39, 4.32]],
  image: { width: 2668, height: 3159 },
  cellSizeMetres: 100,
  sourceCrs: "EPSG:32632",
  classes: [
    { value: 1, label: "Very low", color: "#1a9641", areaKm2: 27.42 },
    { value: 2, label: "Low", color: "#a6d96a", areaKm2: 1648.2 },
    { value: 3, label: "Moderate", color: "#ffffbf", areaKm2: 4158.89 },
    { value: 4, label: "High", color: "#fdae61", areaKm2: 2900.41 },
    { value: 5, label: "Very high", color: "#d7191c", areaKm2: 1606.52 },
  ],
  totalAreaKm2: 10341.44,
  source: {
    id: "20000000-0000-4000-8000-000000000001",
    provider: "Rivers State data team",
    datasetName: "Flood risk map 2026",
    url: "https://example.test/flood-risk",
    license: "CC BY 4.0",
    downloadedOn: "2026-11-03",
    notes: null,
    createdAt: "2026-11-03T10:00:00.000Z",
  },
  promotedAt: "2026-11-03T11:00:00.000Z",
  createdAt: "2026-11-03T10:00:00.000Z",
};

describe("floodRiskLegend", () => {
  it("has one row per class, lowest risk first, painted with the colour the picture uses", () => {
    const rows = floodRiskLegend(layer.classes);
    expect(rows.map((row) => row.label)).toEqual([
      "Flood risk: Very low",
      "Flood risk: Low",
      "Flood risk: Moderate",
      "Flood risk: High",
      "Flood risk: Very high",
    ]);
    expect(rows.map((row) => row.color)).toEqual(layer.classes.map((risk) => risk.color));
    expect(new Set(rows.map((row) => row.key)).size).toBe(5);
    expect(rows.every((row) => row.swatch === "flood-risk")).toBe(true);
  });
});

describe("floodRiskNote", () => {
  it("credits the data source the administrator chose, and says it is derived and relative", () => {
    const note = floodRiskNote(layer);
    expect(note).toContain("Rivers State data team");
    expect(note).toContain("Flood risk map 2026");
    expect(note).toContain("CC BY 4.0");
    expect(note).toContain("100 m");
    expect(note).toMatch(/derived/);
    expect(note).toMatch(/not a forecast or flood depth/);
  });
});

describe("classShare", () => {
  it("is a class's share of the classified area, to one decimal", () => {
    const shares = layer.classes.map((risk) => classShare(risk, layer.totalAreaKm2));
    expect(shares).toEqual([0.3, 15.9, 40.2, 28, 15.5]);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(99.9, 0);
  });

  it("is 0 for a map with no area", () => {
    expect(classShare(layer.classes[0]!, 0)).toBe(0);
  });
});

describe("what the layer holds before the picture arrives", () => {
  it("is a tiny inline image and four corners, so the layer can be added to the map at once", () => {
    expect(EMPTY_IMAGE.startsWith("data:image/")).toBe(true);
    expect(PARKED_CORNERS).toHaveLength(4);
  });
});

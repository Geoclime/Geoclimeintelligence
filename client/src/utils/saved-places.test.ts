import { describe, expect, it } from "vitest";
import type { ClickedFeature, SavedPlace } from "../types/map-layer.types";
import { describeWhere, handSavedPlaceIn, placeOnMapFrom } from "./saved-places";

const dot = (properties: Record<string, unknown>, layerId = "infrastructure-dots"): ClickedFeature => ({
  layerId,
  properties,
  coordinates: [7.0123, 4.8156],
});

const saved = { id: "p1", name: "St. Mary's", facilityType: "health", osmClass: "hospital", origin: "manual", note: "Open 24 hours" };

describe("handSavedPlaceIn", () => {
  it("finds a place saved by hand under the click, at the place's own point", () => {
    expect(handSavedPlaceIn([dot(saved)])).toEqual({
      id: "p1",
      name: "St. Mary's",
      facilityType: "health",
      osmClass: "hospital",
      note: "Open 24 hours",
      point: [7.0123, 4.8156],
    });
  });

  it("ignores an imported facility, a dot with no point, and other layers", () => {
    expect(handSavedPlaceIn([dot({ ...saved, origin: "import" })])).toBeNull();
    expect(handSavedPlaceIn([{ ...dot(saved), coordinates: null }])).toBeNull();
    expect(handSavedPlaceIn([dot(saved, "lga-fill")])).toBeNull();
    expect(handSavedPlaceIn([])).toBeNull();
  });

  it("picks the saved place when it sits among other features, and reads a missing note as none", () => {
    const place = handSavedPlaceIn([dot({ id: "x", origin: "import" }), dot({ ...saved, note: null, name: null })]);
    expect(place).toMatchObject({ id: "p1", name: null, note: null });
  });
});

describe("describeWhere", () => {
  const unit = (level: number, unitName: string) => ({ id: `u${level}`, countryCode: "NGA", level, levelName: "", unitName, unitCode: null });

  it("names the areas smallest first, whatever order the server listed them in", () => {
    const result = { point: [7, 4.8] as [number, number], units: [unit(1, "Rivers"), unit(2, "Port Harcourt"), unit(3, "Phward 2")] };
    expect(describeWhere(result)).toBe("Phward 2, Port Harcourt, Rivers");
  });

  it("is empty when the spot is in no area, or nothing has been looked up", () => {
    expect(describeWhere({ point: [0, 0], units: [] })).toBe("");
    expect(describeWhere(null)).toBe("");
  });
});

describe("placeOnMapFrom", () => {
  it("turns the server's longitude and latitude into a point", () => {
    const place: SavedPlace = {
      id: "p1",
      name: "St. Mary's",
      facilityType: "health",
      osmClass: "hospital",
      note: null,
      origin: "manual",
      longitude: 7,
      latitude: 4.8,
      adminUnitId: null,
      createdAt: "2026-10-31T00:00:00.000Z",
    };
    expect(placeOnMapFrom(place)).toEqual({ id: "p1", name: "St. Mary's", facilityType: "health", osmClass: "hospital", note: null, point: [7, 4.8] });
  });
});

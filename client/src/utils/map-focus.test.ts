import { describe, expect, it } from "vitest";
import { areaFocusLink, communityFocusLink, facilityFocusLink, readMapFocus } from "./map-focus";
import { readLayers, readMapView, readPin, readPinLabel } from "./map-url";

const BOX: [number, number, number, number] = [6.9, 4.7, 7.1, 4.9];

function paramsOf(link: { to: string }): URLSearchParams {
  return new URL(link.to, "https://example.test").searchParams;
}

describe("areaFocusLink", () => {
  it("highlights an LGA and asks for its box", () => {
    const link = areaFocusLink({ id: "lga-1", level: 2, parentId: "state-1", bbox: BOX });
    expect(link.to).toBe("/map?lga=lga-1");
    expect(link.state.mapFocus).toEqual({ bounds: BOX });
  });

  it("highlights the LGA a ward belongs to, not the ward", () => {
    const link = areaFocusLink({ id: "ward-1", level: 3, parentId: "lga-1", bbox: BOX });
    expect(paramsOf(link).get("lga")).toBe("lga-1");
  });

  it("highlights nothing for the state, and leaves the address bare", () => {
    const link = areaFocusLink({ id: "state-1", level: 1, parentId: null, bbox: BOX });
    expect(link.to).toBe("/map");
  });

  it("keeps the layers the viewer chose when already on the map, and drops the old view, LGA and pin", () => {
    const current = new URLSearchParams("lng=7&lat=4.8&z=12&lga=old&pin=7,4.8&pinLabel=Old&layers=state,roads");
    const params = paramsOf(areaFocusLink({ id: "lga-1", level: 2, parentId: null, bbox: BOX }, current));
    expect(params.get("lga")).toBe("lga-1");
    expect(params.get("layers")).toBe("state,roads");
    expect(readLayers(params).roads).toBe(true);
    expect(["lng", "lat", "z", "pin", "pinLabel"].some((name) => params.has(name))).toBe(false);
  });
});

describe("communityFocusLink", () => {
  const point: [number, number] = [7.0134, 4.7774];

  it("opens a shared link on the community, pinned and named", () => {
    const params = paramsOf(communityFocusLink({ name: "Rumuokoro", point }));
    expect(readMapView(params)).toEqual({ longitude: 7.0134, latitude: 4.7774, zoom: 15 });
    expect(readPin(params)).toEqual([7.0134, 4.7774]);
    expect(readPinLabel(params)).toBe("Rumuokoro");
  });

  it("asks the map for a box round the community and for the spot to be looked up", () => {
    const { mapFocus } = communityFocusLink({ name: "Rumuokoro", point }).state;
    expect(mapFocus.pin).toEqual({ point, label: "Rumuokoro" });
    const [west, south, east, north] = mapFocus.bounds;
    expect(west).toBeLessThan(point[0]);
    expect(east).toBeGreaterThan(point[0]);
    expect(south).toBeLessThan(point[1]);
    expect(north).toBeGreaterThan(point[1]);
  });

  it("keeps the viewer's layers but not an earlier pin or LGA", () => {
    const current = new URLSearchParams("lga=old&pin=7,4.8&pinLabel=Old&layers=state");
    const params = paramsOf(communityFocusLink({ name: "Rumuokoro", point }, current));
    expect(params.get("layers")).toBe("state");
    expect(params.has("lga")).toBe(false);
    expect(readPinLabel(params)).toBe("Rumuokoro");
  });
});

describe("facilityFocusLink", () => {
  const point: [number, number] = [7.0134, 4.7774];

  it("opens a shared link close in on the facility, pinned and named", () => {
    const params = paramsOf(facilityFocusLink({ name: "General Hospital", point }));
    expect(readMapView(params)).toEqual({ longitude: 7.0134, latitude: 4.7774, zoom: 17 });
    expect(readPin(params)).toEqual([7.0134, 4.7774]);
    expect(readPinLabel(params)).toBe("General Hospital");
  });

  it("fits a tighter box than a community gets, and asks for the spot to be looked up", () => {
    const facility = facilityFocusLink({ name: "General Hospital", point }).state.mapFocus;
    const community = communityFocusLink({ name: "Rumuokoro", point }).state.mapFocus;
    const width = (bounds: [number, number, number, number]) => bounds[2] - bounds[0];
    expect(width(facility.bounds)).toBeLessThan(width(community.bounds));
    expect(facility.pin).toEqual({ point, label: "General Hospital" });
  });

  it("keeps the viewer's layers but not an earlier pin or LGA", () => {
    const current = new URLSearchParams("lga=old&pin=7,4.8&pinLabel=Old&layers=state,infrastructure");
    const params = paramsOf(facilityFocusLink({ name: "General Hospital", point }, current));
    expect(params.get("layers")).toBe("state,infrastructure");
    expect(params.has("lga")).toBe(false);
    expect(readPinLabel(params)).toBe("General Hospital");
  });
});

describe("readMapFocus", () => {
  it("reads back what a link carries", () => {
    expect(readMapFocus(areaFocusLink({ id: "a", level: 2, parentId: null, bbox: BOX }).state)).toEqual({ bounds: BOX });
    const community = communityFocusLink({ name: "Rumuokoro", point: [7, 4.8] });
    expect(readMapFocus(community.state)).toEqual(community.state.mapFocus);
  });

  it("is null for no request, or one that is not sound", () => {
    expect(readMapFocus(null)).toBeNull();
    expect(readMapFocus(undefined)).toBeNull();
    expect(readMapFocus({})).toBeNull();
    expect(readMapFocus({ mapFocus: { bounds: [1, 2, 3] } })).toBeNull();
    expect(readMapFocus({ mapFocus: { bounds: [1, 2, 3, Number.NaN] } })).toBeNull();
    expect(readMapFocus({ mapFocus: { bounds: BOX, pin: { point: [7], label: "x" } } })).toBeNull();
    expect(readMapFocus({ mapFocus: { bounds: BOX, pin: { point: [7, 4], label: 5 } } })).toBeNull();
  });
});

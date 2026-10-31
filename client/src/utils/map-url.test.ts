import { describe, expect, it } from "vitest";
import { isMapLink, readLayers, readMapView, readPin, readPinLabel, writeLayers, writeMapView, writePin } from "./map-url";

describe("isMapLink", () => {
  it("recognises an old map link by any of its parameters", () => {
    expect(isMapLink(new URLSearchParams("lng=7.01&lat=4.77&z=11.5"))).toBe(true);
    expect(isMapLink(new URLSearchParams("lga=abc"))).toBe(true);
    expect(isMapLink(new URLSearchParams("layers=state,lga"))).toBe(true);
    expect(isMapLink(new URLSearchParams("pin=7.01,4.77"))).toBe(true);
  });

  it("leaves a plain landing-page address alone", () => {
    expect(isMapLink(new URLSearchParams(""))).toBe(false);
    expect(isMapLink(new URLSearchParams("utm_source=newsletter"))).toBe(false);
  });
});

describe("map URL state", () => {
  it("round-trips a view, rounded for a tidy link", () => {
    const params = writeMapView(new URLSearchParams("lga=abc"), { longitude: 7.013412, latitude: 4.777421, zoom: 11.53 });
    expect(params.toString()).toBe("lga=abc&lng=7.0134&lat=4.7774&z=11.5");
    expect(readMapView(params)).toEqual({ longitude: 7.0134, latitude: 4.7774, zoom: 11.5 });
  });

  it("ignores a missing or impossible view instead of failing", () => {
    expect(readMapView(new URLSearchParams(""))).toBeNull();
    expect(readMapView(new URLSearchParams("lng=7&lat=95&z=9"))).toBeNull();
    expect(readMapView(new URLSearchParams("lng=abc&lat=4&z=9"))).toBeNull();
  });

  it("round-trips a pinned place, and drops it again", () => {
    const params = writePin(new URLSearchParams("lga=abc"), [7.013412, 4.777421]);
    expect(params.get("pin")).toBe("7.01341,4.77742");
    expect(readPin(params)).toEqual([7.01341, 4.77742]);
    expect(writePin(params, null).has("pin")).toBe(false);
    expect(writePin(params, null).get("lga")).toBe("abc");
  });

  it("carries a short label with the pin, and removes it with the pin", () => {
    const params = writePin(new URLSearchParams(), [7.0134, 4.7774], "  Flood report ");
    expect(readPinLabel(params)).toBe("Flood report");
    expect(readPinLabel(writePin(params, [7.0134, 4.7774]))).toBeNull();
    expect(writePin(params, null).toString()).toBe("");
    expect(readPinLabel(new URLSearchParams(`pinLabel=${"x".repeat(200)}`))).toHaveLength(60);
  });

  it("ignores a missing or impossible pin instead of failing", () => {
    expect(readPin(new URLSearchParams(""))).toBeNull();
    expect(readPin(new URLSearchParams("pin=7.01"))).toBeNull();
    expect(readPin(new URLSearchParams("pin=7.01,95"))).toBeNull();
    expect(readPin(new URLSearchParams("pin=abc,4"))).toBeNull();
  });

  const everything = { state: true, lga: true, ward: true, roads: true, waterways: true, settlements: true, infrastructure: true, buildings: true };
  const nothing = { state: false, lga: false, ward: false, roads: false, waterways: false, settlements: false, infrastructure: false, buildings: false };

  it("shows every layer by default and only lists layers when some are off", () => {
    expect(readLayers(new URLSearchParams(""))).toEqual(everything);
    const params = writeLayers(new URLSearchParams(""), { ...everything, lga: false, roads: false });
    expect(params.get("layers")).toBe("state,ward,waterways,settlements,infrastructure,buildings");
    expect(readLayers(params)).toEqual({ ...everything, lga: false, roads: false });
    expect(writeLayers(params, everything).has("layers")).toBe(false);
  });

  it("carries the roads, waterways, settlements and infrastructure layers in the link", () => {
    expect(readLayers(new URLSearchParams("layers=roads,settlements"))).toEqual({ ...nothing, roads: true, settlements: true });
    expect(readLayers(new URLSearchParams("layers=infrastructure"))).toEqual({ ...nothing, infrastructure: true });
  });

  it("drops unknown layer names", () => {
    expect(readLayers(new URLSearchParams("layers=rainfall,lga"))).toEqual({ ...nothing, lga: true });
  });
});

import { describe, expect, it } from "vitest";
import { readLayers, readMapView, writeLayers, writeMapView } from "./map-url";

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

  it("shows every layer by default and only lists layers when some are off", () => {
    expect(readLayers(new URLSearchParams(""))).toEqual({ state: true, lga: true, ward: true });
    const params = writeLayers(new URLSearchParams(""), { state: true, lga: false, ward: true });
    expect(params.get("layers")).toBe("state,ward");
    expect(readLayers(params)).toEqual({ state: true, lga: false, ward: true });
    expect(writeLayers(params, { state: true, lga: true, ward: true }).has("layers")).toBe(false);
  });

  it("drops unknown layer names", () => {
    expect(readLayers(new URLSearchParams("layers=rainfall,lga"))).toEqual({ state: false, lga: true, ward: false });
  });
});

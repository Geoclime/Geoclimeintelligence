import { describe, expect, it } from "vitest";
import { isMapLink, readLayers, readMapView, writeLayers, writeMapView } from "./map-url";

describe("isMapLink", () => {
  it("recognises an old map link by any of its parameters", () => {
    expect(isMapLink(new URLSearchParams("lng=7.01&lat=4.77&z=11.5"))).toBe(true);
    expect(isMapLink(new URLSearchParams("lga=abc"))).toBe(true);
    expect(isMapLink(new URLSearchParams("layers=state,lga"))).toBe(true);
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

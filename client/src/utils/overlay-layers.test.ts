import { describe, expect, it } from "vitest";
import { overlayHint } from "./overlay-layers";

const shown = { truncated: false, featureCount: 100 };

describe("overlayHint", () => {
  it("says so when a layer has no data loaded, whatever the zoom", () => {
    expect(overlayHint("roads", { zoom: 15, truncated: false, featureCount: 0 })).toBe("No data loaded yet");
    expect(overlayHint("settlements", { zoom: 8, truncated: false, featureCount: 0 })).toBe("No data loaded yet");
  });

  it("does not claim a layer is empty before the layer list has loaded", () => {
    expect(overlayHint("settlements", { zoom: 8, truncated: false, featureCount: null })).toBeUndefined();
  });

  it("tells you to zoom in when the server had to cut the layer short", () => {
    expect(overlayHint("roads", { zoom: 14, truncated: true, featureCount: 100 })).toBe("Too many here to show: zoom in");
  });

  it("explains that smaller roads and creeks arrive with zoom", () => {
    expect(overlayHint("roads", { zoom: 9, ...shown })).toBe("Smaller roads appear as you zoom in");
    // Service roads arrive at 13, but tracks and paths only at 14 (layer-rules.ts).
    expect(overlayHint("roads", { zoom: 13, ...shown })).toBe("Smaller roads appear as you zoom in");
    expect(overlayHint("roads", { zoom: 14, ...shown })).toBeUndefined();
    expect(overlayHint("waterways", { zoom: 10, ...shown })).toBe("Creeks and small water appear as you zoom in");
    expect(overlayHint("waterways", { zoom: 11, ...shown })).toBeUndefined();
  });

  it("judges the zoom the server is sent, which is rounded", () => {
    expect(overlayHint("roads", { zoom: 13.4, ...shown })).toBe("Smaller roads appear as you zoom in");
    expect(overlayHint("roads", { zoom: 13.5, ...shown })).toBeUndefined();
    expect(overlayHint("waterways", { zoom: 10.6, ...shown })).toBeUndefined();
  });

  it("has nothing to add for settlements, which are always shown in full", () => {
    expect(overlayHint("settlements", { zoom: 8, ...shown })).toBeUndefined();
  });
});

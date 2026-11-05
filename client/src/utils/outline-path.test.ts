import type { MultiPolygon } from "geojson";
import { describe, expect, it } from "vitest";
import { multiPolygonPath, outlineFrame } from "./outline-path";

describe("outlineFrame", () => {
  it("keeps the bbox's shape: at the equator a 2 x 1 degree box is twice as wide as tall", () => {
    const frame = outlineFrame([0, 0, 2, 1], 200);
    expect(frame.width).toBe(200);
    expect(frame.height).toBeCloseTo(100, 0);
  });

  it("puts the north-west corner top-left and the south-east corner bottom-right, inside the padding", () => {
    const frame = outlineFrame([6.4, 4.3, 7.6, 5.7], 500, 10);
    const [x0, y0] = frame.project([6.4, 5.7]);
    const [x1, y1] = frame.project([7.6, 4.3]);
    expect(x0).toBeCloseTo(10);
    expect(y0).toBeCloseTo(10);
    expect(x1).toBeCloseTo(490);
    expect(y1).toBeCloseTo(frame.height - 10, 0);
  });

  it("narrows longitude by the cosine of the middle latitude", () => {
    const equator = outlineFrame([0, -1, 1, 1], 100);
    const north = outlineFrame([0, 59, 1, 61], 100);
    // The same 1 x 2 degree box is taller relative to its width further from the equator.
    expect(north.height).toBeGreaterThan(equator.height * 1.9);
  });
});

describe("multiPolygonPath", () => {
  it("draws each ring as a closed sub-path, holes included", () => {
    const square: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [
        [
          [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
          [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.25]],
        ],
      ],
    };
    const path = multiPolygonPath(square, outlineFrame([0, 0, 1, 1], 100));
    expect(path.match(/M/g)).toHaveLength(2);
    expect(path.match(/Z/g)).toHaveLength(2);
    expect(path.startsWith("M0,100L100,100L100,0L0,0L0,100Z")).toBe(true);
  });

  it("skips a degenerate ring", () => {
    const sliver: MultiPolygon = { type: "MultiPolygon", coordinates: [[[[0, 0], [1, 1]]]] };
    expect(multiPolygonPath(sliver, outlineFrame([0, 0, 1, 1], 100))).toBe("");
  });
});

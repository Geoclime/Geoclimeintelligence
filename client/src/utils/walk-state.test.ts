import { describe, expect, it } from "vitest";
import { addPoint, draftOf, dropLast, EMPTY_WALK, methodOf, walkFromDraft } from "./walk-state";

describe("walk state", () => {
  it("adds points in order, keeping an accuracy for each GPS point and none for a tap", () => {
    let walk = addPoint(EMPTY_WALK, [7, 4.8], "gps", { accuracy: 6 });
    walk = addPoint(walk, [7.001, 4.8], "tap");
    walk = addPoint(walk, [7.001, 4.801], "gps", { accuracy: 9 });
    expect(walk).toEqual({ points: [[7, 4.8], [7.001, 4.8], [7.001, 4.801]], origins: ["gps", "tap", "gps"], accuracies: [6, 9] });
    expect(EMPTY_WALK.points).toEqual([]);
  });

  it("lets a new spot replace the last, since a spot is one point", () => {
    const first = addPoint(EMPTY_WALK, [7, 4.8], "gps", { accuracy: 6, single: true });
    const moved = addPoint(first, [7.0002, 4.8], "gps", { accuracy: 4, single: true });
    expect(moved).toEqual({ points: [[7.0002, 4.8]], origins: ["gps"], accuracies: [4] });
  });

  it("undoes the last point and its accuracy, and does nothing on an empty walk", () => {
    const walk = addPoint(addPoint(EMPTY_WALK, [7, 4.8], "gps", { accuracy: 6 }), [7.001, 4.8], "tap");
    const undone = dropLast(walk);
    expect(undone).toEqual({ points: [[7, 4.8]], origins: ["gps"], accuracies: [6] });
    expect(dropLast(undone)).toEqual(EMPTY_WALK);
    expect(dropLast(EMPTY_WALK)).toBe(EMPTY_WALK);
  });

  it("calls a shape walked if any point came from the GPS, and drawn if every point was tapped", () => {
    expect(methodOf(addPoint(addPoint(EMPTY_WALK, [7, 4.8], "tap"), [7.1, 4.8], "gps", { accuracy: 5 }))).toBe("walked");
    expect(methodOf(addPoint(EMPTY_WALK, [7, 4.8], "tap"))).toBe("drawn");
    expect(methodOf(EMPTY_WALK)).toBe("drawn");
  });

  it("keeps a walk on the device and gets it back, with the walked points first", () => {
    const walk = addPoint(addPoint(EMPTY_WALK, [7, 4.8], "gps", { accuracy: 6 }), [7.001, 4.8], "tap");
    const draft = draftOf("flood", walk)!;
    expect(draft).toEqual({ target: "flood", points: walk.points, gpsPoints: 1, accuracies: [6] });
    expect(walkFromDraft({ ...draft, savedAt: 1 })).toEqual(walk);
    expect(draftOf("flood", EMPTY_WALK)).toBeNull();
  });
});

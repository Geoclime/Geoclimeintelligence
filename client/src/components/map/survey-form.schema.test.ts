import { describe, expect, it } from "vitest";
import type { LonLat } from "../../types/admin-unit.types";
import { drainFormSchema, floodFormSchema, kindsFor, toDrainBody, toFloodBody } from "./survey-form.schema";

const RING: LonLat[] = [[7, 4.8], [7.001, 4.8], [7.001, 4.801]];

describe("flood form", () => {
  it("takes no depth and no note, or either of them", () => {
    expect(floodFormSchema.safeParse({ depth: "", note: "" }).success).toBe(true);
    expect(floodFormSchema.safeParse({ depth: "waist", note: " Water to the fence " }).data).toEqual({ depth: "waist", note: "Water to the fence" });
  });

  it("refuses a depth that is not one of the five, and a note that is too long", () => {
    expect(floodFormSchema.safeParse({ depth: "ocean", note: "" }).success).toBe(false);
    expect(floodFormSchema.safeParse({ depth: "", note: "x".repeat(501) }).success).toBe(false);
  });

  it("builds the body from the walk: depth and note only when given, accuracy only for a walk", () => {
    const values = floodFormSchema.parse({ depth: "knee", note: "Near the market" });
    expect(toFloodBody(values, { points: RING }, { method: "walked", accuracyM: 8.34 })).toEqual({ points: RING, method: "walked", accuracyM: 8.3, depth: "knee", note: "Near the market" });
    expect(toFloodBody({ depth: "", note: "" }, { points: RING }, { method: "drawn", accuracyM: 8 })).toEqual({ points: RING, method: "drawn" });
  });
});

describe("drain form", () => {
  const valid = { kind: "open_drain", condition: "blocked", name: " Aba Road drain ", widthM: "1.5", depthM: "", note: "" };

  it("accepts a kind and a condition, with the name and sizes optional", () => {
    expect(drainFormSchema.safeParse(valid).data).toMatchObject({ name: "Aba Road drain", widthM: "1.5" });
    expect(drainFormSchema.safeParse({ ...valid, name: "", widthM: "" }).success).toBe(true);
  });

  it("refuses an impossible size, and asks for the kind and condition", () => {
    expect(drainFormSchema.safeParse({ ...valid, widthM: "-2" }).success).toBe(false);
    expect(drainFormSchema.safeParse({ ...valid, depthM: "400" }).success).toBe(false);
    expect(drainFormSchema.safeParse({ ...valid, widthM: "wide" }).success).toBe(false);
    expect(drainFormSchema.safeParse({ ...valid, kind: "", condition: "" }).error?.issues.map((i) => i.message)).toEqual([
      "Choose what kind of drainage this is",
      "Choose the condition it is in",
    ]);
  });

  it("sends a drain's whole walk, and a culvert's one spot", () => {
    const drain = toDrainBody(drainFormSchema.parse(valid), { points: RING }, "walked");
    expect(drain).toEqual({ kind: "open_drain", condition: "blocked", method: "walked", points: RING, name: "Aba Road drain", widthM: 1.5 });
    const culvert = toDrainBody(drainFormSchema.parse({ ...valid, kind: "culvert" }), { points: RING }, "drawn");
    expect(culvert.points).toEqual([[7, 4.8]]);
  });

  it("offers drain kinds for a walked line, and the others for a spot", () => {
    expect(kindsFor("drain-line")).toEqual(["open_drain", "covered_drain"]);
    expect(kindsFor("drain-spot")).toEqual(["culvert", "outfall", "inlet", "retention_pond"]);
  });
});

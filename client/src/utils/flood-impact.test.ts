import { describe, expect, it } from "vitest";
import type { FloodImpact } from "../types/field-survey.types";
import { drainsHeadline, impactHeadline, joinList } from "./flood-impact";

const none: FloodImpact = {
  areaM2: 1_000,
  buildings: 0,
  roadMetres: 0,
  facilities: { total: 0, items: [] },
  settlements: [],
  wards: [],
  drains: { total: 0, needAttention: 0, items: [] },
};

describe("joinList", () => {
  it("reads like a sentence", () => {
    expect(joinList(["a"])).toBe("a");
    expect(joinList(["a", "b"])).toBe("a and b");
    expect(joinList(["a", "b", "c"])).toBe("a, b and c");
  });
});

describe("impactHeadline", () => {
  it("names what the flood reaches, in the right number", () => {
    expect(impactHeadline({ ...none, buildings: 142, facilities: { total: 2, items: [] }, roadMetres: 320 })).toBe("Reaches 142 buildings, 2 facilities and 320 m of road");
    expect(impactHeadline({ ...none, buildings: 1, facilities: { total: 1, items: [] } })).toBe("Reaches 1 building and 1 facility");
  });

  it("names only what is there", () => {
    expect(impactHeadline({ ...none, roadMetres: 1_800 })).toBe("Reaches 1.8 km of road");
  });

  it("says so when it reaches none of them", () => {
    expect(impactHeadline(none)).toMatch(/No buildings, facilities or roads/);
  });
});

describe("drainsHeadline", () => {
  it("says nothing when there are no drains near, and sends someone to look when one is blocked", () => {
    expect(drainsHeadline(none.drains, 150)).toBeNull();
    expect(drainsHeadline({ total: 3, needAttention: 2, items: [] }, 150)).toBe("3 drains within 150 m, 2 need attention");
    expect(drainsHeadline({ total: 1, needAttention: 1, items: [] }, 150)).toBe("1 drain within 150 m, 1 needs attention");
    expect(drainsHeadline({ total: 2, needAttention: 0, items: [] }, 150)).toBe("2 drains within 150 m, none blocked");
  });
});

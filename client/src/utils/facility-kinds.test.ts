import { describe, expect, it } from "vitest";
import { describeKind, FACILITY_KIND_GROUPS, isPickableKind } from "./facility-kinds";

describe("FACILITY_KIND_GROUPS", () => {
  it("covers each of the ten facility types once, in the server's order", () => {
    expect(FACILITY_KIND_GROUPS.map((group) => group.type)).toEqual([
      "health",
      "emergency",
      "education",
      "government",
      "market",
      "transport",
      "community",
      "worship",
      "water",
      "telecom",
    ]);
  });

  it("offers each kind once, and every group has at least one", () => {
    const values = FACILITY_KIND_GROUPS.flatMap((group) => group.kinds.map((kind) => kind.value));
    expect(new Set(values).size).toBe(values.length);
    expect(FACILITY_KIND_GROUPS.every((group) => group.kinds.length > 0)).toBe(true);
    expect(values).toContain("hospital");
  });
});

describe("describeKind", () => {
  it("uses the picker's wording for a kind it offers", () => {
    expect(describeKind("hospital")).toBe("Hospital");
    expect(describeKind("ferry_terminal")).toBe("Ferry terminal or jetty");
    expect(isPickableKind("hospital")).toBe(true);
  });

  it("makes any other class readable instead of showing it raw", () => {
    expect(describeKind("chemist")).toBe("Chemist");
    expect(describeKind("fast_food")).toBe("Fast food");
    expect(describeKind("")).toBe("Place");
    expect(isPickableKind("chemist")).toBe(false);
  });
});

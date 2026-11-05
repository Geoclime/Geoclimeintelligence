import { describe, expect, it } from "vitest";
import type { AdminUnitSummary } from "../types/admin-unit.types";
import { alertCoverage, describeCoverage } from "./alert-coverage";

const unit = (overrides: Partial<AdminUnitSummary>): AdminUnitSummary => ({
  id: "x",
  countryCode: "NGA",
  level: 2,
  levelName: "LGA",
  unitName: "Okrika",
  unitCode: null,
  parentId: "rivers",
  sourceId: "s",
  childCount: 0,
  bbox: [0, 0, 1, 1],
  centroid: [0.5, 0.5],
  ...overrides,
});

const rivers = unit({ id: "rivers", level: 1, levelName: "State", unitName: "Rivers", parentId: null, childCount: 23 });
const bayelsa = unit({ id: "bayelsa", level: 1, levelName: "State", unitName: "Bayelsa", parentId: null, childCount: 8 });
const okrika = unit({ id: "okrika", unitName: "Okrika" });
const eleme = unit({ id: "eleme", unitName: "Eleme" });
const yenagoa = unit({ id: "yenagoa", unitName: "Yenagoa", parentId: "bayelsa" });

describe("alertCoverage", () => {
  it("counts the LGAs chosen one by one", () => {
    expect(alertCoverage([okrika, eleme]).lgaCount).toBe(2);
  });

  it("counts a whole state as every LGA in it", () => {
    expect(alertCoverage([rivers]).lgaCount).toBe(23);
  });

  it("adds nothing for an LGA inside a chosen state: the state is the whole of it", () => {
    const coverage = alertCoverage([rivers, okrika, eleme]);
    expect(coverage.lgaCount).toBe(23);
    expect(coverage.looseLgas).toEqual([]);
  });

  it("adds an LGA from another state to a chosen state", () => {
    expect(alertCoverage([rivers, yenagoa]).lgaCount).toBe(24);
  });
});

describe("describeCoverage", () => {
  it("says nothing until something is chosen", () => {
    expect(describeCoverage(alertCoverage([]))).toBe("");
  });

  it("says how many LGAs, in the singular too", () => {
    expect(describeCoverage(alertCoverage([okrika, eleme]))).toBe("Covers 2 LGAs.");
    expect(describeCoverage(alertCoverage([okrika]))).toBe("Covers 1 LGA.");
  });

  it("makes a whole state unmistakable", () => {
    expect(describeCoverage(alertCoverage([rivers]))).toBe("Covers all 23 LGAs in Rivers State.");
    expect(describeCoverage(alertCoverage([rivers, okrika]))).toBe("Covers all 23 LGAs in Rivers State.");
  });

  it("names several states, and LGAs outside them", () => {
    expect(describeCoverage(alertCoverage([rivers, bayelsa]))).toBe("Covers 31 LGAs: every LGA in Rivers State and Bayelsa State.");
    expect(describeCoverage(alertCoverage([rivers, yenagoa]))).toBe("Covers 24 LGAs: every LGA in Rivers State and 1 LGA elsewhere.");
  });
});

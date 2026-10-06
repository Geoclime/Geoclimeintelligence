import { describe, expect, it } from "vitest";
import type { Country } from "../../types/country.types";
import { countryFormSchema, toCountryPatch, toNewCountry } from "./country-form.schema";

const valid = {
  countryCode: "nga",
  countryName: "Nigeria",
  levelNames: [{ name: "State" }, { name: "LGA" }, { name: "Ward" }],
  bbox: { minLon: "", minLat: "", maxLon: "", maxLat: "" },
};

const nigeria: Country = {
  countryCode: "NGA",
  countryName: "Nigeria",
  levels: [
    { level: 1, name: "State", unitCount: 1 },
    { level: 2, name: "LGA", unitCount: 23 },
    { level: 3, name: "Ward", unitCount: 317 },
  ],
  bbox: null,
  createdAt: "2026-10-05T10:00:00.000Z",
  updatedAt: "2026-10-05T10:00:00.000Z",
};

describe("countryFormSchema", () => {
  it("upper-cases the code and sends levels in order", () => {
    const parsed = countryFormSchema.parse(valid);
    expect(toNewCountry(parsed)).toEqual({ countryCode: "NGA", countryName: "Nigeria", levelNames: ["State", "LGA", "Ward"], bbox: null });
  });

  it("rejects repeated level names, a bad code and a half-filled box", () => {
    const result = countryFormSchema.safeParse({
      ...valid,
      countryCode: "NG",
      levelNames: [{ name: "State" }, { name: "state" }],
      bbox: { minLon: "2.5", minLat: "", maxLon: "", maxLat: "" },
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((issue) => issue.path.join("."))).toEqual(["countryCode", "levelNames", "bbox"]);
  });

  it("rejects an inverted box", () => {
    const result = countryFormSchema.safeParse({ ...valid, bbox: { minLon: "14.8", minLat: "4", maxLon: "2.5", maxLat: "14" } });
    expect(result.error!.issues[0]!.message).toMatch(/West must be less than East/);
  });
});

describe("toCountryPatch", () => {
  it("sends only what changed", () => {
    const values = countryFormSchema.parse({
      ...valid,
      levelNames: [{ name: "State" }, { name: "Local Government Area" }, { name: "Ward" }],
      bbox: { minLon: "2.5", minLat: "4.0", maxLon: "14.8", maxLat: "14.0" },
    });
    expect(toCountryPatch(values, nigeria)).toEqual({
      levelNames: ["State", "Local Government Area", "Ward"],
      bbox: [2.5, 4, 14.8, 14],
    });
    expect(toCountryPatch(countryFormSchema.parse(valid), nigeria)).toEqual({});
  });
});

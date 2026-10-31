import { describe, expect, it } from "vitest";
import { DEFAULT_PHONE_COUNTRY, PHONE_COUNTRIES } from "./phone-countries";
import { formatNational, isValidPhone, joinPhone, normalisePhone, splitPhone } from "./phone";

describe("joinPhone", () => {
  it("drops the 0 people dial at home and anything that isn't a digit", () => {
    expect(joinPhone(DEFAULT_PHONE_COUNTRY, "0803 123 4567")).toBe("+2348031234567");
    expect(joinPhone(DEFAULT_PHONE_COUNTRY, "(803) 123-4567")).toBe("+2348031234567");
  });

  it("is empty until there is a digit to keep, so a required field still complains", () => {
    expect(joinPhone(DEFAULT_PHONE_COUNTRY, "")).toBe("");
    expect(joinPhone(DEFAULT_PHONE_COUNTRY, " 0 ")).toBe("");
  });
});

describe("normalisePhone", () => {
  it("reads every way of writing the same Nigerian number", () => {
    for (const written of ["+234 803 123 4567", "+2348031234567", "0803 123 4567", "08031234567", "8031234567", "2348031234567", "00234 803 123 4567"]) {
      expect(normalisePhone(written)).toBe("+2348031234567");
    }
  });

  it("keeps a number from another country as it is", () => {
    expect(normalisePhone("+44 7700 900123")).toBe("+447700900123");
  });

  it("is empty for nothing", () => {
    expect(normalisePhone("  ")).toBe("");
    expect(normalisePhone("call me")).toBe("");
  });
});

describe("splitPhone", () => {
  it("finds the country and keeps the rest", () => {
    expect(splitPhone("+2348031234567")).toEqual({ country: DEFAULT_PHONE_COUNTRY, national: "8031234567" });
    expect(splitPhone("+27821234567")).toMatchObject({ country: { iso: "ZA" }, national: "821234567" });
    expect(splitPhone("+447700900123")).toMatchObject({ country: { iso: "GB" }, national: "7700900123" });
    expect(splitPhone("+14155550123")).toMatchObject({ country: { iso: "US" }, national: "4155550123" });
    expect(splitPhone("+351912345678")).toMatchObject({ country: { iso: "PT" }, national: "912345678" });
  });

  it("returns no country for a code that isn't listed", () => {
    expect(splitPhone("+999123456789").country).toBeNull();
    expect(splitPhone("").country).toBeNull();
  });
});

describe("formatNational", () => {
  it("groups digits for reading", () => {
    expect(formatNational("8031234567")).toBe("803 123 4567");
    expect(formatNational("80312")).toBe("803 12");
    expect(formatNational("")).toBe("");
  });
});

describe("isValidPhone", () => {
  it("wants a country code and a full number", () => {
    expect(isValidPhone("+2348031234567")).toBe(true);
    expect(isValidPhone("+23480")).toBe(false);
    expect(isValidPhone("08031234567")).toBe(false);
    expect(isValidPhone("+23480312345678901")).toBe(false);
  });
});

describe("the country list", () => {
  it("has no repeated country or calling code, so a number always has one home", () => {
    expect(new Set(PHONE_COUNTRIES.map((entry) => entry.iso)).size).toBe(PHONE_COUNTRIES.length);
    expect(new Set(PHONE_COUNTRIES.map((entry) => entry.dial)).size).toBe(PHONE_COUNTRIES.length);
  });

  it("has no calling code that starts another's, so the first match is right", () => {
    const dials = PHONE_COUNTRIES.map((entry) => entry.dial);
    for (const dial of dials) expect(dials.filter((other) => other !== dial && dial.startsWith(other))).toEqual([]);
  });
});

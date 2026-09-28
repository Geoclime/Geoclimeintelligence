import { describe, expect, it } from "vitest";
import { paginationDetails, parsePageParam } from "./pagination";

describe("paginationDetails", () => {
  it("derives page counts and neighbours from the backend's meta", () => {
    expect(paginationDetails({ page: 2, pageSize: 25, total: 60 })).toEqual({
      page: 2,
      pageSize: 25,
      total: 60,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
  });

  it("reports no next page on the last page", () => {
    expect(paginationDetails({ page: 3, pageSize: 25, total: 60 }).hasNext).toBe(false);
  });

  it("treats a missing meta as a single empty page", () => {
    expect(paginationDetails(undefined)).toMatchObject({ totalPages: 0, hasNext: false, hasPrev: false });
  });

  it("does not divide by zero", () => {
    expect(paginationDetails({ page: 1, pageSize: 0, total: 10 }).totalPages).toBe(0);
  });
});

describe("parsePageParam", () => {
  it.each([
    ["3", 3],
    [null, 1],
    ["0", 1],
    ["-2", 1],
    ["2.5", 1],
    ["abc", 1],
  ])("parses %s as %i", (input, expected) => {
    expect(parsePageParam(input)).toBe(expected);
  });
});

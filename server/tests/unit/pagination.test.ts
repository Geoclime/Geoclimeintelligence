import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/common/errors/app-error";
import { decodeCursor, encodeCursor, offsetPageQuerySchema } from "../../src/common/pagination/pagination";

describe("cursor encoding", () => {
  it("round-trips a position", () => {
    const position = { value: "2026-09-01T00:00:00.000Z", id: "abc" };
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  it("rejects a tampered cursor with a 400 ValidationError", () => {
    expect(() => decodeCursor("not-a-cursor")).toThrow(ValidationError);
  });
});

describe("offsetPageQuerySchema", () => {
  it("applies defaults and coerces query-string numbers", () => {
    expect(offsetPageQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 });
    expect(offsetPageQuerySchema.parse({ page: "3", pageSize: "10" })).toEqual({ page: 3, pageSize: 10 });
  });

  it("caps pageSize at 100", () => {
    expect(offsetPageQuerySchema.safeParse({ pageSize: "500" }).success).toBe(false);
  });
});

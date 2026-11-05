import { describe, expect, it } from "vitest";
import { placeFormSchema, toNewPlaceBody, toUpdatePlaceBody } from "./place-form.schema";

const valid = { name: "  St. Mary's Hospital ", kind: "hospital", note: "" };

describe("placeFormSchema", () => {
  it("accepts a name and a kind, with the note optional, and tidies the name", () => {
    const parsed = placeFormSchema.parse(valid);
    expect(parsed).toEqual({ name: "St. Mary's Hospital", kind: "hospital", note: "" });
  });

  it("asks for a name and a kind", () => {
    const result = placeFormSchema.safeParse({ name: " ", kind: "", note: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Give the place a name", "Choose what kind of place this is"]);
  });

  it("limits the note to what the server stores", () => {
    expect(placeFormSchema.safeParse({ ...valid, note: "x".repeat(500) }).success).toBe(true);
    expect(placeFormSchema.safeParse({ ...valid, note: "x".repeat(501) }).error?.issues[0]?.message).toMatch(/500 characters/);
  });
});

describe("request bodies", () => {
  it("builds the save body with the clicked point as longitude then latitude, and leaves a blank note out", () => {
    expect(toNewPlaceBody(placeFormSchema.parse(valid), [7.0123, 4.8156])).toEqual({
      name: "St. Mary's Hospital",
      kind: "hospital",
      longitude: 7.0123,
      latitude: 4.8156,
    });
    expect(toNewPlaceBody(placeFormSchema.parse({ ...valid, note: " Open 24 hours " }), [7, 4.8])).toMatchObject({ note: "Open 24 hours" });
  });

  it("sends a blank note on an edit so the old one is cleared", () => {
    expect(toUpdatePlaceBody(placeFormSchema.parse(valid))).toEqual({ name: "St. Mary's Hospital", kind: "hospital", note: "" });
  });
});

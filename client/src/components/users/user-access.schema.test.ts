import { describe, expect, it } from "vitest";
import { toAccessPatch, userAccessSchema } from "./user-access.schema";

const REGION = "8b0f7c1e-3f5a-4d2b-9c61-2f7e4a1b9d30";

describe("userAccessSchema", () => {
  it("accepts a scoped responder", () => {
    expect(userAccessSchema.safeParse({ role: "emergency_responder", scopeAdminUnitId: REGION }).success).toBe(true);
  });

  it("rejects a malformed region ID on a scopable role", () => {
    const result = userAccessSchema.safeParse({ role: "government_official", scopeAdminUnitId: "obio-akpor" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["scopeAdminUnitId"]);
  });

  it("ignores a stale scope value when the role can't be scoped", () => {
    expect(userAccessSchema.safeParse({ role: "researcher", scopeAdminUnitId: "anything" }).success).toBe(true);
  });
});

describe("toAccessPatch", () => {
  it("clears the scope for roles that can't carry one", () => {
    expect(toAccessPatch({ role: "administrator", scopeAdminUnitId: REGION })).toEqual({
      role: "administrator",
      scopeAdminUnitId: null,
    });
  });

  it("sends a blank scope as null (unrestricted)", () => {
    expect(toAccessPatch({ role: "emergency_responder", scopeAdminUnitId: "" }).scopeAdminUnitId).toBeNull();
  });

  it("keeps the scope for scopable roles", () => {
    expect(toAccessPatch({ role: "emergency_responder", scopeAdminUnitId: REGION }).scopeAdminUnitId).toBe(REGION);
  });
});

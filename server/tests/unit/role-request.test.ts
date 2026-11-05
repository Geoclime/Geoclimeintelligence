import { describe, expect, it } from "vitest";
import { ConflictError } from "../../src/common/errors/app-error";
import { AuthService } from "../../src/modules/auth/auth.service";
import { roleRequestSchema } from "../../src/modules/auth/auth.validation";
import { UserService } from "../../src/modules/users/user.service";
import { asAuthUser, fakeRegions, FakeTokenVerifier, InMemoryUserRepository, makeUser } from "../fakes";

const REGION = "11111111-1111-4111-8111-111111111111";

function setup() {
  const admin = makeUser({ role: "administrator" });
  const member = makeUser({ role: "general_public" });
  const repo = new InMemoryUserRepository([admin, member]);
  return {
    admin,
    member,
    repo,
    auth: new AuthService(repo, new FakeTokenVerifier()),
    users: new UserService(repo, fakeRegions([REGION])),
  };
}

describe("asking for a role", () => {
  it("opens a request that grants nothing, and saves the organisation for the administrator", async () => {
    const { auth, member } = setup();
    const profile = await auth.requestRole(asAuthUser(member), {
      role: "emergency_responder",
      reason: "I coordinate flood response for the Red Cross in Port Harcourt.",
      organisation: "Nigerian Red Cross",
    });
    expect(profile.role).toBe("general_public");
    expect(profile.organisation).toBe("Nigerian Red Cross");
    expect(profile.roleRequest).toMatchObject({ role: "emergency_responder", reason: expect.stringContaining("Red Cross") });
  });

  it("refuses a role the user already has, and any request from an administrator", async () => {
    const { auth, admin } = setup();
    const researcher = makeUser({ role: "researcher" });
    await expect(auth.requestRole(asAuthUser(researcher), { role: "researcher", reason: "For my thesis on floods." })).rejects.toBeInstanceOf(ConflictError);
    await expect(auth.requestRole(asAuthUser(admin), { role: "researcher", reason: "For my thesis on floods." })).rejects.toBeInstanceOf(ConflictError);
  });

  it("never accepts administrator or general_public as a requested role", () => {
    for (const role of ["administrator", "general_public"]) {
      expect(roleRequestSchema.safeParse({ body: { role, reason: "Please give me this role." } }).success).toBe(false);
    }
    expect(roleRequestSchema.safeParse({ body: { role: "researcher", reason: "short" } }).success).toBe(false);
  });

  it("lets the user withdraw it", async () => {
    const { auth, member } = setup();
    await auth.requestRole(asAuthUser(member), { role: "researcher", reason: "Rainfall research at UNIPORT." });
    expect((await auth.withdrawRoleRequest(asAuthUser(member))).roleRequest).toBeNull();
  });
});

describe("answering a request", () => {
  it("closes it when the administrator gives the requested role", async () => {
    const { auth, users, admin, member } = setup();
    await auth.requestRole(asAuthUser(member), { role: "emergency_responder", reason: "SEMA field coordinator." });
    const updated = await users.updateAccess(member.id, { role: "emergency_responder", scopeAdminUnitId: REGION }, asAuthUser(admin));
    expect(updated).toMatchObject({ role: "emergency_responder", scopeAdminUnitId: REGION, roleRequest: null });
  });

  it("keeps it open when the administrator changes something else", async () => {
    const { auth, users, admin, member } = setup();
    await auth.requestRole(asAuthUser(member), { role: "government_official", reason: "Ministry of Environment planner." });
    const updated = await users.updateAccess(member.id, { role: "researcher" }, asAuthUser(admin));
    expect(updated.roleRequest?.role).toBe("government_official");
  });

  it("declines it without changing the role, and 409s when there is nothing to decline", async () => {
    const { auth, users, member } = setup();
    await auth.requestRole(asAuthUser(member), { role: "researcher", reason: "Hydrology research project." });
    const declined = await users.declineRoleRequest(member.id);
    expect(declined).toMatchObject({ role: "general_public", roleRequest: null });
    await expect(users.declineRoleRequest(member.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("lists only open requests when asked", async () => {
    const { auth, users, member } = setup();
    await auth.requestRole(asAuthUser(member), { role: "researcher", reason: "Hydrology research project." });
    const { items } = await users.list({ page: 1, pageSize: 25, pendingRequest: true });
    expect(items.map((u) => u.id)).toEqual([member.id]);
  });
});

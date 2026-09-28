import { describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "../../src/common/errors/app-error";
import { UserService } from "../../src/modules/users/user.service";
import { asAuthUser, InMemoryUserRepository, makeUser } from "../fakes";

const ADMIN_UNIT = "11111111-1111-4111-8111-111111111111";

function setup() {
  const admin = makeUser({ role: "administrator" });
  const target = makeUser();
  const repo = new InMemoryUserRepository([admin, target]);
  return { service: new UserService(repo), admin: asAuthUser(admin), target };
}

describe("UserService.updateAccess", () => {
  it("promotes a user to a scoped staff role", async () => {
    const { service, admin, target } = setup();
    const dto = await service.updateAccess(
      target.id,
      { role: "emergency_responder", scopeAdminUnitId: ADMIN_UNIT },
      admin,
    );
    expect(dto).toMatchObject({ role: "emergency_responder", scopeAdminUnitId: ADMIN_UNIT });
  });

  it("refuses to let an administrator change their own access", async () => {
    const { service, admin } = setup();
    await expect(service.updateAccess(admin.id, { role: "general_public" }, admin)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("returns 404 for an unknown user", async () => {
    const { service, admin } = setup();
    await expect(
      service.updateAccess("99999999-9999-4999-8999-999999999999", { role: "researcher" }, admin),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a region scope on a role that cannot be scoped", async () => {
    const { service, admin, target } = setup();
    await expect(
      service.updateAccess(target.id, { role: "researcher", scopeAdminUnitId: ADMIN_UNIT }, admin),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a role change that would leave an inherited scope on an unscopable role", async () => {
    const { service, admin, target } = setup();
    target.role = "government_official";
    target.scopeAdminUnitId = ADMIN_UNIT;
    await expect(service.updateAccess(target.id, { role: "administrator" }, admin)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      service.updateAccess(target.id, { role: "administrator", scopeAdminUnitId: null }, admin),
    ).resolves.toMatchObject({ role: "administrator", scopeAdminUnitId: null });
  });
});

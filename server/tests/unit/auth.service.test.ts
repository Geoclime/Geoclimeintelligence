import { describe, expect, it } from "vitest";
import { UnauthorizedError } from "../../src/common/errors/app-error";
import { AuthService } from "../../src/modules/auth/auth.service";
import type { TokenVerifier } from "../../src/modules/auth/firebase-token-verifier";
import { FakeTokenVerifier, InMemoryUserRepository, makeUser } from "../fakes";

describe("AuthService.verifyToken", () => {
  it("returns the verified identity for a valid token", async () => {
    const service = new AuthService(new InMemoryUserRepository(), new FakeTokenVerifier());
    await expect(service.verifyToken("valid:abc")).resolves.toMatchObject({ uid: "abc" });
  });

  it("maps Firebase auth/* rejections to 401", async () => {
    const service = new AuthService(new InMemoryUserRepository(), new FakeTokenVerifier());
    await expect(service.verifyToken("garbage")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("does not disguise infrastructure failures as 401", async () => {
    const outage = new Error("getaddrinfo ENOTFOUND www.googleapis.com");
    const verifier: TokenVerifier = { verify: () => Promise.reject(outage) };
    const service = new AuthService(new InMemoryUserRepository(), verifier);
    await expect(service.verifyToken("valid:abc")).rejects.toBe(outage);
  });
});

describe("AuthService.resolveUser", () => {
  it("returns the existing row without creating a new one", async () => {
    const existing = makeUser({ firebaseUid: "uid-1", role: "researcher" });
    const repo = new InMemoryUserRepository([existing]);
    const service = new AuthService(repo, new FakeTokenVerifier());

    const user = await service.resolveUser({ uid: "uid-1", email: "x@example.test", name: null });

    expect(user).toMatchObject({ id: existing.id, role: "researcher" });
    expect(repo.createCalls).toBe(0);
  });

  it("creates a first-time user at the lowest-privilege role with no region scope", async () => {
    const repo = new InMemoryUserRepository();
    const service = new AuthService(repo, new FakeTokenVerifier());

    const user = await service.resolveUser({ uid: "new-uid", email: "new@example.test", name: "New Person" });

    expect(user).toMatchObject({
      firebaseUid: "new-uid",
      email: "new@example.test",
      displayName: "New Person",
      role: "general_public",
      scopeAdminUnitId: null,
    });
    expect(repo.rows.size).toBe(1);
  });
});

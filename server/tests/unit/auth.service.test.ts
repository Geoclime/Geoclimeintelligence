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

    const user = await service.resolveUser({ uid: "uid-1", email: "x@example.test", emailVerified: true, name: null });

    expect(user).toMatchObject({ id: existing.id, role: "researcher" });
    expect(repo.createCalls).toBe(0);
  });

  it("creates a first-time user at the lowest-privilege role with no region scope", async () => {
    const repo = new InMemoryUserRepository();
    const service = new AuthService(repo, new FakeTokenVerifier());

    const user = await service.resolveUser({ uid: "new-uid", email: "new@example.test", emailVerified: false, name: "New Person" });

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

describe("AuthService.resolveUser: bootstrapping the first administrator", () => {
  const BOOTSTRAP = "founder@example.test";
  const identity = { uid: "founder", email: "Founder@Example.test", emailVerified: true, name: null };

  it("promotes the configured, verified email while no administrator exists", async () => {
    const repo = new InMemoryUserRepository([makeUser({ firebaseUid: "founder", email: "founder@example.test" })]);
    const service = new AuthService(repo, new FakeTokenVerifier(), BOOTSTRAP);
    await expect(service.resolveUser(identity)).resolves.toMatchObject({ role: "administrator", scopeAdminUnitId: null });
  });

  it("creates a brand-new row straight as administrator", async () => {
    const repo = new InMemoryUserRepository();
    const service = new AuthService(repo, new FakeTokenVerifier(), BOOTSTRAP);
    await expect(service.resolveUser(identity)).resolves.toMatchObject({ role: "administrator" });
  });

  it("ignores an unverified email, so nobody can claim the address by signing up first", async () => {
    const service = new AuthService(new InMemoryUserRepository(), new FakeTokenVerifier(), BOOTSTRAP);
    await expect(service.resolveUser({ ...identity, emailVerified: false })).resolves.toMatchObject({
      role: "general_public",
    });
  });

  it("does nothing once the platform has an administrator", async () => {
    const repo = new InMemoryUserRepository([makeUser({ role: "administrator" })]);
    const service = new AuthService(repo, new FakeTokenVerifier(), BOOTSTRAP);
    await expect(service.resolveUser(identity)).resolves.toMatchObject({ role: "general_public" });
  });

  it("does nothing for other emails, or when the setting is empty", async () => {
    const other = { ...identity, uid: "other", email: "other@example.test" };
    await expect(
      new AuthService(new InMemoryUserRepository(), new FakeTokenVerifier(), BOOTSTRAP).resolveUser(other),
    ).resolves.toMatchObject({ role: "general_public" });
    await expect(
      new AuthService(new InMemoryUserRepository(), new FakeTokenVerifier(), "").resolveUser(identity),
    ).resolves.toMatchObject({ role: "general_public" });
  });
});

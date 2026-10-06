import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { AuthService } from "../../src/modules/auth/auth.service";
import { UserService } from "../../src/modules/users/user.service";
import { fakeRegions, FakeTokenVerifier, InMemoryUserRepository, makeUser } from "../fakes";

// Drives the real Express app -- real middleware order, routers, validation and error
// handler -- with the database and Firebase swapped for in-memory fakes.

const admin = makeUser({ firebaseUid: "admin-uid", role: "administrator" });
const member = makeUser({ firebaseUid: "member-uid" });
let repo: InMemoryUserRepository;
let verifySpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  repo = new InMemoryUserRepository([makeUser({ ...admin }), makeUser({ ...member })]);
  const authService = new AuthService(repo, new FakeTokenVerifier());
  verifySpy = vi.spyOn(authService, "verifyToken");
  vi.spyOn(AuthService, "Instance", "get").mockReturnValue(authService);
  vi.spyOn(UserService, "Instance", "get").mockReturnValue(new UserService(repo, fakeRegions(["11111111-1111-4111-8111-111111111111"])));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const app = createApp();
const bearer = (uid: string) => ({ Authorization: `Bearer valid:${uid}` });

describe("public routes", () => {
  it("GET /health needs no token", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: "ok" }, message: "OK" });
  });
});

describe("authentication", () => {
  it("rejects a request with no bearer token with a 401 envelope", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, data: null, message: "Missing bearer token" });
  });

  it("rejects an invalid token with 401", async () => {
    const res = await request(app).get("/api/v1/auth/me").set("Authorization", "Bearer forged");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid or expired token");
  });

  it("creates a general_public users row on a first-time token", async () => {
    const res = await request(app).get("/api/v1/auth/me").set(bearer("brand-new"));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ firebaseUid: "brand-new", role: "general_public", scopeAdminUnitId: null });
    expect(repo.rows.size).toBe(3);
  });

  it("verifies the token once per request, not once per mounted router (section 11)", async () => {
    await request(app).get("/api/v1/users").set(bearer("admin-uid"));
    expect(verifySpy).toHaveBeenCalledTimes(1);
  });
});

describe("role-guarded routes", () => {
  it("lets an administrator list users with pagination meta", async () => {
    const res = await request(app).get("/api/v1/users?page=1&pageSize=10").set(bearer("admin-uid"));
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 10, total: 2 });
  });

  it("rejects a general_public user with 403", async () => {
    const res = await request(app).get("/api/v1/users").set(bearer("member-uid"));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      success: false,
      data: null,
      message: "Your role is not permitted to perform this action",
    });
  });

  it("returns field-level 400 errors from validation", async () => {
    const res = await request(app).get("/api/v1/users?pageSize=1000").set(bearer("admin-uid"));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(res.body.errors[0].field).toBe("pageSize");
  });

  it("lets an administrator scope a user to a region", async () => {
    const target = [...repo.rows.values()].find((u) => u.firebaseUid === "member-uid")!;
    const res = await request(app)
      .patch(`/api/v1/users/${target.id}/access`)
      .set(bearer("admin-uid"))
      .send({ role: "government_official", scopeAdminUnitId: "11111111-1111-4111-8111-111111111111" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ role: "government_official" });
  });

  it("rejects unknown body fields", async () => {
    const target = [...repo.rows.values()].find((u) => u.firebaseUid === "member-uid")!;
    const res = await request(app)
      .patch(`/api/v1/users/${target.id}/access`)
      .set(bearer("admin-uid"))
      .send({ role: "researcher", isAdmin: true });
    expect(res.status).toBe(400);
  });
});

describe("error handling", () => {
  it("returns a 400 envelope for malformed JSON", async () => {
    const res = await request(app)
      .patch("/api/v1/users/00000000-0000-4000-8000-000000000001/access")
      .set(bearer("admin-uid"))
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, data: null, message: "Malformed request body" });
  });

  it("hides internals behind a generic 500", async () => {
    vi.spyOn(repo, "findPage").mockRejectedValue(new Error("connection terminated: secret-host:5432"));
    const res = await request(app).get("/api/v1/users").set(bearer("admin-uid"));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, data: null, message: "Something went wrong" });
  });

  it("returns a 404 envelope for unknown routes", async () => {
    const res = await request(app).get("/api/v1/nope").set(bearer("admin-uid"));
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

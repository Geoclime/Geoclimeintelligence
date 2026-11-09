import type { AuthUser, VerifiedIdentity } from "../src/common/access/auth-user";
import type { AuditEntry } from "../src/modules/audit/audit.types";
import type { TokenVerifier } from "../src/modules/auth/firebase-token-verifier";
import type { RoleRecord } from "../src/modules/roles/role.types";
import { User } from "../src/modules/users/user.entity";
import { toAuthUser, type IUserRepository, type NewUser, type RoleRequestPatch, type UserAccessPatch, type UserListQuery, type UserProfilePatch } from "../src/modules/users/user.types";

let sequence = 0;

export function makeUser(overrides: Partial<User> = {}): User {
  sequence += 1;
  const user = new User();
  Object.assign(user, {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    firebaseUid: `firebase-uid-${sequence}`,
    email: `user${sequence}@example.test`,
    displayName: null,
    phone: null,
    organisation: null,
    jobTitle: null,
    role: "general_public",
    scopeAdminUnitId: null,
    homeAdminUnitId: null,
    requestedRole: null,
    roleRequestReason: null,
    roleRequestedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  });
  return user;
}

export function asAuthUser(user: User): AuthUser {
  return toAuthUser(user);
}

/** In-memory IUserRepository -- lets services run with no database. */
export class InMemoryUserRepository implements IUserRepository {
  readonly rows = new Map<string, User>();
  createCalls = 0;

  constructor(users: User[] = []) {
    for (const user of users) this.rows.set(user.id, user);
  }

  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }

  async findByFirebaseUid(firebaseUid: string) {
    return [...this.rows.values()].find((u) => u.firebaseUid === firebaseUid) ?? null;
  }

  async createIfAbsent(input: NewUser) {
    this.createCalls += 1;
    const existing = await this.findByFirebaseUid(input.firebaseUid);
    if (existing) return existing;
    const user = makeUser(input);
    this.rows.set(user.id, user);
    return user;
  }

  async findPage(query: UserListQuery) {
    const needle = query.q?.toLowerCase();
    const all = [...this.rows.values()].filter(
      (u) =>
        (!query.role || u.role === query.role) &&
        (!query.pendingRequest || u.requestedRole !== null) &&
        (!needle || [u.email, u.displayName, u.organisation].some((value) => value?.toLowerCase().includes(needle))),
    );
    const start = (query.page - 1) * query.pageSize;
    return {
      items: all.slice(start, start + query.pageSize),
      meta: { page: query.page, pageSize: query.pageSize, total: all.length },
    };
  }

  async updateAccess(id: string, patch: UserAccessPatch) {
    const user = this.rows.get(id);
    if (!user) return null;
    Object.assign(user, patch);
    return user;
  }

  async updateProfile(id: string, patch: UserProfilePatch) {
    const user = this.rows.get(id);
    if (!user) return null;
    Object.assign(user, patch);
    return user;
  }

  async setRoleRequest(id: string, request: RoleRequestPatch | null) {
    const user = this.rows.get(id);
    if (!user) return null;
    Object.assign(user, request ?? { requestedRole: null, roleRequestReason: null, roleRequestedAt: null });
    return user;
  }

  async hasAnyAdministrator() {
    return [...this.rows.values()].some((u) => u.role === "administrator");
  }
}

/** Stands in for admin_units when a service only asks "does this area exist?". */
export function fakeRegions(knownIds: string[] = []) {
  const ids = new Set(knownIds);
  return { exists: async (id: string) => ids.has(id) };
}

/** Stands in for the activity log: keeps every entry a service wrote, so a test can read them back. */
export function fakeAudit() {
  const entries: { actor: AuthUser; entry: AuditEntry }[] = [];
  return {
    entries,
    record: async (actor: AuthUser, entry: AuditEntry) => {
      entries.push({ actor, entry });
    },
  };
}

/** Stands in for photo storage: nothing is stored, so removing the photos of a record always works. */
export function fakePhotos() {
  return { removeAllFor: async () => {} };
}

/** The five built-in roles, as the roles table holds them: only the field and government roles can be limited to an area. */
const BUILT_IN_ROLES: Record<string, RoleRecord> = Object.fromEntries(
  [
    ["general_public", "General public", false],
    ["emergency_responder", "Emergency responder", true],
    ["government_official", "Government official", true],
    ["researcher", "Researcher", false],
    ["administrator", "Administrator", false],
  ].map(([code, name, canBeScoped]) => [code, { code, name, description: name, isSystem: true, canBeScoped }] as [string, RoleRecord]),
);

/** Stands in for the roles table: finds a built-in role by its code, and nothing else. */
export function fakeRoles() {
  return { findByCode: async (code: string) => BUILT_IN_ROLES[code] ?? null };
}

/**
 * Accepts tokens of the form "valid:<uid>" (email verified) or "unverified:<uid>"; rejects
 * everything else the way Firebase does. The email is always "<uid>@example.test".
 */
export class FakeTokenVerifier implements TokenVerifier {
  async verify(idToken: string): Promise<VerifiedIdentity> {
    const match = /^(valid|unverified):(.+)$/.exec(idToken);
    if (match) {
      const uid = match[2]!;
      return { uid, email: `${uid}@example.test`, emailVerified: match[1] === "valid", name: null };
    }
    throw Object.assign(new Error("Decoding Firebase ID token failed"), { code: "auth/argument-error" });
  }
}

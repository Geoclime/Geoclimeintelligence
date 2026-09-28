import type { AuthUser, VerifiedIdentity } from "../src/common/access/auth-user";
import type { OffsetPageQuery } from "../src/common/pagination/pagination";
import type { TokenVerifier } from "../src/modules/auth/firebase-token-verifier";
import { User } from "../src/modules/users/user.entity";
import type { IUserRepository, NewUser, UserAccessPatch } from "../src/modules/users/user.types";

let sequence = 0;

export function makeUser(overrides: Partial<User> = {}): User {
  sequence += 1;
  const user = new User();
  Object.assign(user, {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    firebaseUid: `firebase-uid-${sequence}`,
    email: `user${sequence}@example.test`,
    displayName: null,
    role: "general_public",
    scopeAdminUnitId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  });
  return user;
}

export function asAuthUser(user: User): AuthUser {
  const { id, firebaseUid, email, displayName, role, scopeAdminUnitId } = user;
  return { id, firebaseUid, email, displayName, role, scopeAdminUnitId };
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

  async findPage(query: OffsetPageQuery) {
    const all = [...this.rows.values()];
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
}

/** Accepts tokens of the form "valid:<uid>"; rejects everything else the way Firebase does. */
export class FakeTokenVerifier implements TokenVerifier {
  async verify(idToken: string): Promise<VerifiedIdentity> {
    if (idToken.startsWith("valid:")) {
      const uid = idToken.slice("valid:".length);
      return { uid, email: `${uid}@example.test`, name: null };
    }
    throw Object.assign(new Error("Decoding Firebase ID token failed"), { code: "auth/argument-error" });
  }
}

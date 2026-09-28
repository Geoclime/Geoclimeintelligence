// Builders for stubbed API payloads, shaped exactly like the backend's DTOs. They exist only to
// feed cy.intercept() in specs; the app itself never renders invented data (rule 19.4).

export type Role = "general_public" | "emergency_responder" | "government_official" | "researcher" | "administrator";

export interface StubUser {
  id: string;
  firebaseUid: string;
  email: string | null;
  displayName: string | null;
  role: Role;
  scopeAdminUnitId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A deterministic UUID-shaped id from a number, so specs can refer to rows predictably. */
export function stubId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export function buildUser(overrides: Partial<StubUser> & { n?: number } = {}): StubUser {
  const { n = 1, ...rest } = overrides;
  return {
    id: stubId(n),
    firebaseUid: `firebase-uid-${n}`,
    email: `user${n}@example.com`,
    displayName: null,
    role: "general_public",
    scopeAdminUnitId: null,
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-01T09:00:00.000Z",
    ...rest,
  };
}

export function buildUsers(count: number, startAt = 1): StubUser[] {
  return Array.from({ length: count }, (_, i) => buildUser({ n: startAt + i }));
}

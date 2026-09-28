import type { RouteMatcherOptions } from "cypress/types/net-stubbing";
import { buildUser, type Role, type StubUser } from "./factories";

// Must match E2E_SESSION_KEY in src/transport/e2e-identity.ts.
const E2E_SESSION_KEY = "e2e:identity-session";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Either a fixture file holding a full envelope, or the pieces of one to build here. */
export type StubResponse =
  | { fixture: string; statusCode?: number }
  | {
      data?: unknown;
      message?: string;
      meta?: { page?: number; pageSize?: number; total?: number; nextCursor?: string };
      errors?: { field?: string; message: string }[];
      statusCode?: number;
      delayMs?: number;
    };

interface LoginOptions {
  user?: Partial<StubUser>;
  emailVerified?: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /** The only sanctioned element lookup: `[data-cy="…"]`. */
      dataCy(value: string): Chainable<JQuery<HTMLElement>>;
      /**
       * cy.intercept() for `/api/v1<path>`, answering with the backend's ApiResponse envelope.
       * `path` may use globs, e.g. "/users*".
       */
      interceptApi(
        method: HttpMethod,
        path: string,
        response: StubResponse,
        matcher?: Partial<RouteMatcherOptions>,
      ): Chainable<null>;
      /**
       * Starts the test signed in as `role`: seeds the fake identity session before the app loads
       * and stubs GET /api/v1/auth/me (aliased @getMe). Never a real Firebase sign-in.
       */
      login(role?: Role, options?: LoginOptions): Chainable<StubUser>;
    }
  }
}

Cypress.Commands.add("dataCy", (value: string) => cy.get(`[data-cy="${value}"]`));

Cypress.Commands.add("interceptApi", (method, path, response, matcher = {}) => {
  const routeMatcher = { method, url: `**/api/v1${path}`, ...matcher };
  if ("fixture" in response) {
    return cy.intercept(routeMatcher, { statusCode: response.statusCode ?? 200, fixture: response.fixture });
  }
  const statusCode = response.statusCode ?? 200;
  const success = statusCode < 400;
  const body = {
    success,
    data: response.data ?? null,
    message: response.message ?? (success ? "OK" : "Request failed"),
    ...(response.errors ? { errors: response.errors } : {}),
    ...(response.meta ? { meta: response.meta } : {}),
  };
  return cy.intercept(routeMatcher, { statusCode, body, delay: response.delayMs });
});

Cypress.Commands.add("login", (role: Role = "general_public", options: LoginOptions = {}) => {
  const user = buildUser({ n: 9000, role, email: `${role}@example.com`, ...options.user });
  const session = { uid: user.firebaseUid, email: user.email, emailVerified: options.emailVerified ?? true };
  cy.on("window:before:load", (win) => {
    win.localStorage.setItem(E2E_SESSION_KEY, JSON.stringify(session));
  });
  cy.interceptApi("GET", "/auth/me", { data: user }).as("getMe");
  return cy.wrap(user, { log: false });
});

export {};

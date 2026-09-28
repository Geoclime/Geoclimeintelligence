import { buildUser } from "../../support/factories";

describe("Session and account", () => {
  it("restores a signed-in session and shows the role from the backend", () => {
    cy.login("researcher");
    cy.visit("/");
    cy.wait("@getMe");
    cy.dataCy("access-summary").within(() => {
      cy.dataCy("role-badge").should("have.text", "Researcher");
      cy.dataCy("access-region").should("contain", "All of Rivers State");
    });
    cy.dataCy("nav-users").should("not.exist");
  });

  it("shows when an account is limited to one region", () => {
    cy.login("emergency_responder", { user: { scopeAdminUnitId: "8b0f7c1e-3f5a-4d2b-9c61-2f7e4a1b9d30" } });
    cy.visit("/");
    cy.dataCy("access-region").should("contain", "Limited to one region").and("contain", "8b0f7c1e");
  });

  it("offers a retry, not a guessed role, when the backend is unavailable", () => {
    cy.login("general_public");
    cy.interceptApi("GET", "/auth/me", { statusCode: 500, message: "Something went wrong" }).as("getMeFailed");
    cy.visit("/");
    cy.wait("@getMeFailed");
    cy.dataCy("error-state").should("contain", "We couldn't load your account");
    cy.dataCy("home-page").should("not.exist");

    cy.interceptApi("GET", "/auth/me", { data: buildUser({ role: "general_public" }) }).as("getMeOk");
    cy.dataCy("retry").click();
    cy.wait("@getMeOk");
    cy.dataCy("home-page").should("be.visible");
  });

  it("signs the user out when the backend rejects their token even after a refresh", () => {
    cy.login("general_public");
    cy.interceptApi("GET", "/auth/me", { statusCode: 401, message: "Invalid or expired token" }).as("getMe401");
    cy.visit("/");
    // One original request plus exactly one retry after the forced token refresh.
    cy.wait("@getMe401");
    cy.wait("@getMe401");
    cy.location("pathname").should("eq", "/sign-in");
  });

  it("signs out from the account menu", () => {
    cy.login("government_official");
    cy.visit("/");
    cy.dataCy("user-menu-trigger").click();
    cy.dataCy("user-menu").should("be.visible");
    cy.dataCy("sign-out").click();
    cy.location("pathname").should("eq", "/sign-in");
    cy.dataCy("toast-info").should("contain", "signed out");
  });

  it("remembers the chosen colour theme across reloads", () => {
    cy.login("general_public");
    cy.visit("/");
    cy.dataCy("user-menu-trigger").click();
    cy.dataCy("theme-toggle").find('input[value="dark"]').check({ force: true });
    cy.get("html").should("have.attr", "data-theme", "dark");
    cy.reload();
    cy.get("html").should("have.attr", "data-theme", "dark");
  });

  it("shows a not-found page for unknown addresses", () => {
    cy.login("general_public");
    cy.visit("/no-such-page");
    cy.dataCy("not-found").should("be.visible");
  });

  it("drops the verify-email notice when the user comes back after verifying elsewhere", () => {
    cy.login("general_public", { emailVerified: false });
    cy.visit("/");
    cy.dataCy("verify-email-notice").should("be.visible");

    // Stand-in for clicking the link in the inbox: mark the fake session verified (key matches
    // E2E_SESSION_KEY in src/transport/e2e-identity.ts), then return focus to the tab.
    cy.window().then((win) => {
      const key = "e2e:identity-session";
      const session = JSON.parse(win.localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
      win.localStorage.setItem(key, JSON.stringify({ ...session, emailVerified: true }));
      win.dispatchEvent(new Event("focus"));
    });
    cy.dataCy("verify-email-notice").should("not.exist");
    cy.dataCy("home-page").should("be.visible");
  });
});

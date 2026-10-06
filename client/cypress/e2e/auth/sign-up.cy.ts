import { buildUser } from "../../support/factories";

// Must match E2E_SESSION_KEY in src/transport/e2e-identity.ts.
const E2E_SESSION_KEY = "e2e:identity-session";

describe("Creating an account", () => {
  beforeEach(() => {
    cy.visit("/sign-up");
  });

  it("checks that the passwords match before submitting", () => {
    cy.dataCy("email").type("new@example.com");
    cy.dataCy("password").type("long-enough-password");
    cy.dataCy("confirm-password").type("something-else").blur();
    cy.dataCy("field-error").should("have.length", 1).and("contain", "don't match");
  });

  it("explains when the email is already registered", () => {
    cy.dataCy("email").type("taken@example.com");
    cy.dataCy("password").type("long-enough-password");
    cy.dataCy("confirm-password").type("long-enough-password");
    cy.dataCy("submit").click();
    cy.dataCy("form-error").should("contain", "already exists");
  });

  it("creates the account but does not sign the user in until the email is verified", () => {
    cy.interceptApi("GET", "/auth/me", { data: buildUser({ role: "general_public", email: "new@example.com" }) }).as(
      "getMe",
    );
    cy.dataCy("email").type("new@example.com");
    cy.dataCy("password").type("long-enough-password");
    cy.dataCy("confirm-password").type("long-enough-password");
    cy.dataCy("submit").click();

    cy.dataCy("verify-email-sent").should("contain", "verification link").and("contain", "new@example.com");
    cy.location("pathname").should("eq", "/sign-up");
    cy.dataCy("map-page").should("not.exist");
    // No session was stored, and the backend was never asked about the new account.
    cy.window().its("localStorage").invoke("getItem", E2E_SESSION_KEY).should("be.null");
    cy.get("@getMe.all").should("have.length", 0);

    cy.contains("a", "Go to sign in").click();
    cy.location("pathname").should("eq", "/sign-in");
  });

  it("says so when the account was created but the verification email could not be sent", () => {
    cy.dataCy("email").type("no-mail@example.com");
    cy.dataCy("password").type("long-enough-password");
    cy.dataCy("confirm-password").type("long-enough-password");
    cy.dataCy("submit").click();

    cy.dataCy("verification-not-sent").should("contain", "couldn't send");
    cy.dataCy("map-page").should("not.exist");
  });
});

describe("Resetting a password", () => {
  it("confirms the email was sent without revealing whether the account exists", () => {
    cy.visit("/sign-in");
    cy.contains("a", "Forgot password?").click();
    cy.location("pathname").should("eq", "/forgot-password");
    cy.dataCy("email").type("someone@example.com");
    cy.dataCy("submit").click();
    cy.dataCy("reset-sent").should("contain", "If an account exists for someone@example.com");
  });
});

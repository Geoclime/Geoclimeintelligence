import { buildUser } from "../../support/factories";

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

  it("creates the account, lands on the overview as General Public, and asks for email verification", () => {
    cy.interceptApi("GET", "/auth/me", { data: buildUser({ role: "general_public", email: "new@example.com" }) }).as(
      "getMe",
    );
    cy.dataCy("email").type("new@example.com");
    cy.dataCy("password").type("long-enough-password");
    cy.dataCy("confirm-password").type("long-enough-password");
    cy.dataCy("submit").click();

    cy.wait("@getMe");
    cy.dataCy("toast-success").should("contain", "verification link");
    cy.dataCy("map-page").should("be.visible");
    cy.dataCy("verify-email-notice").should("be.visible");
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

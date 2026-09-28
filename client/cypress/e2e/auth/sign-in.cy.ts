import { buildUser } from "../../support/factories";

describe("Signing in", () => {
  it("sends a signed-out visitor to sign-in, then into the app with a bearer token", () => {
    cy.interceptApi("GET", "/auth/me", { data: buildUser({ role: "general_public", email: "ada@example.com" }) }).as(
      "getMe",
    );
    cy.visit("/");
    cy.location("pathname").should("eq", "/sign-in");

    cy.dataCy("email").type("ada@example.com");
    cy.dataCy("password").type("a-good-password");
    cy.dataCy("submit").click();

    cy.wait("@getMe").its("request.headers.authorization").should("eq", "Bearer e2e-id-token");
    cy.location("pathname").should("eq", "/");
    cy.dataCy("home-page").should("be.visible");
    cy.dataCy("access-summary").within(() => {
      cy.dataCy("role-badge").should("have.text", "General Public");
    });
  });

  it("returns the user to the page they originally asked for", () => {
    cy.interceptApi("GET", "/auth/me", { data: buildUser({ role: "administrator" }) }).as("getMe");
    cy.interceptApi("GET", "/users*", { fixture: "users/list.json" }).as("getUsers");
    cy.visit("/admin/users");
    cy.location("pathname").should("eq", "/sign-in");

    cy.dataCy("email").type("admin@example.com");
    cy.dataCy("password").type("a-good-password");
    cy.dataCy("submit").click();

    cy.wait("@getUsers");
    cy.location("pathname").should("eq", "/admin/users");
  });

  it("validates the form inline before anything is sent", () => {
    cy.visit("/sign-in");
    cy.dataCy("submit").click();
    cy.dataCy("field-error").should("have.length", 2);
    cy.dataCy("email").type("not-an-email").blur();
    cy.dataCy("field-error").first().should("contain", "valid email");
  });

  it("shows a friendly message for wrong credentials, without saying which part was wrong", () => {
    cy.visit("/sign-in");
    cy.dataCy("email").type("ada@example.com");
    cy.dataCy("password").type("wrong-password");
    cy.dataCy("submit").click();
    cy.dataCy("form-error").should("contain", "don't match an account");
    cy.location("pathname").should("eq", "/sign-in");
  });

  it("toggles password visibility", () => {
    cy.visit("/sign-in");
    cy.dataCy("password").should("have.attr", "type", "password");
    cy.get('[aria-label="Show password"]').click();
    cy.dataCy("password").should("have.attr", "type", "text");
  });
});

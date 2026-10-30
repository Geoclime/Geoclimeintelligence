import { buildUser } from "../../support/factories";

// Nobody picks their own role: sign-up records a REQUEST, and an administrator answers it.

const request = { role: "emergency_responder" as const, reason: "Flood response coordinator for the Red Cross in Port Harcourt.", requestedAt: "2026-10-29T09:00:00.000Z" };

describe("Role requests", () => {
  it("asks who a new account is for, and what an administrator needs to check a staff role", () => {
    cy.visit("/sign-up");
    cy.dataCy("role-request-details").should("not.exist");
    cy.dataCy("joining-as-emergency_responder").click();
    cy.dataCy("role-request-details").should("contain", "emergency responder");

    cy.dataCy("display-name").type("Ada Obi");
    cy.dataCy("email").type("ada@example.com");
    cy.dataCy("password").type("long-enough-password");
    cy.dataCy("confirm-password").type("long-enough-password");
    cy.dataCy("submit").click();
    cy.dataCy("field-error").should("contain", "Enter the organisation").and("contain", "a little more");
  });

  it("shows an open request on the profile, and lets the user withdraw it", () => {
    cy.login("general_public", { user: { roleRequest: request } });
    cy.interceptApi("DELETE", "/auth/me/role-request", { data: buildUser({ n: 9000, roleRequest: null }) }).as("withdraw");
    cy.visit("/account");
    cy.dataCy("role-request-status").should("contain", "emergency responder").and("contain", "Red Cross");
    cy.dataCy("withdraw-role-request").click();
    cy.wait("@withdraw");
  });

  it("lets an administrator approve a request by saving the requested role", () => {
    const asker = buildUser({ n: 2, displayName: "Ada Obi", organisation: "Nigerian Red Cross", roleRequest: request });
    cy.login("administrator");
    cy.interceptApi("GET", "/users*", { data: [asker], meta: { page: 1, pageSize: 25, total: 1 } }).as("getUsers");
    cy.interceptApi("PATCH", `/users/${asker.id}/access`, { data: { ...asker, role: "emergency_responder", roleRequest: null } }).as("approve");
    cy.visit("/admin/users?requests=open");
    cy.wait("@getUsers").its("request.query").should("include", { pendingRequest: "true" });
    cy.dataCy("role-request-badge").should("contain", "Emergency Responder");

    cy.dataCy("edit-access").click();
    cy.dataCy("role-request-callout").should("contain", "Red Cross");
    cy.dataCy("save-access").should("contain", "Approve as Emergency Responder").click();
    cy.wait("@approve").its("request.body").should("deep.include", { role: "emergency_responder" });
  });

  it("lets an administrator decline a request", () => {
    const asker = buildUser({ n: 2, displayName: "Ada Obi", roleRequest: request });
    cy.login("administrator");
    cy.interceptApi("GET", "/users*", { data: [asker], meta: { page: 1, pageSize: 25, total: 1 } });
    cy.interceptApi("DELETE", `/users/${asker.id}/role-request`, { data: { ...asker, roleRequest: null } }).as("decline");
    cy.visit("/admin/users");
    cy.dataCy("edit-access").click();
    cy.dataCy("decline-request").click();
    cy.wait("@decline");
    cy.dataCy("toast-info").should("contain", "declined");
  });
});

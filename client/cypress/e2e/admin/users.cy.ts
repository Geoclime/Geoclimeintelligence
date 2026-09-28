import { buildUsers, stubId } from "../../support/factories";

const REGION = "8b0f7c1e-3f5a-4d2b-9c61-2f7e4a1b9d30";

describe("Administrator: user management", () => {
  it("is hidden from, and refused to, non-administrators", () => {
    cy.login("government_official");
    cy.visit("/admin/users");
    cy.dataCy("forbidden").should("contain", "You don't have access");
    cy.dataCy("nav-users").should("not.exist");
  });

  describe("as an administrator", () => {
    beforeEach(() => {
      cy.login("administrator");
      cy.interceptApi("GET", "/users*", { fixture: "users/list.json" }).as("getUsers");
    });

    it("lists accounts and blocks editing your own", () => {
      cy.visit("/admin/users");
      cy.wait("@getUsers").its("request.query").should("include", { page: "1", pageSize: "25" });
      cy.dataCy("user-row").should("have.length", 3);
      cy.dataCy("user-row").first().should("contain", "You");
      cy.dataCy("user-row").first().find('[data-cy="edit-access"]').should("be.disabled");
      cy.dataCy("pagination").should("contain", "Showing 1–3 of 3 accounts");
    });

    it("pages through accounts, keeping the page in the URL", () => {
      cy.interceptApi("GET", "/users*", { data: buildUsers(25), meta: { page: 1, pageSize: 25, total: 27 } }).as(
        "page1",
      );
      cy.interceptApi(
        "GET",
        "/users*",
        { data: buildUsers(2, 26), meta: { page: 2, pageSize: 25, total: 27 } },
        { query: { page: "2" } },
      ).as("page2");

      cy.visit("/admin/users");
      cy.wait("@page1");
      cy.dataCy("pagination-prev").should("be.disabled");
      cy.dataCy("pagination-next").click();
      cy.wait("@page2");
      cy.location("search").should("eq", "?page=2");
      cy.dataCy("user-row").should("have.length", 2);
      cy.dataCy("pagination-next").should("be.disabled");
    });

    it("grants a scoped staff role and updates the row in place", () => {
      cy.interceptApi("PATCH", `/users/${stubId(2)}/access`, {
        data: {
          id: stubId(2),
          firebaseUid: "firebase-uid-2",
          email: "responder@example.com",
          displayName: null,
          role: "emergency_responder",
          scopeAdminUnitId: REGION,
          createdAt: "2026-09-10T12:30:00.000Z",
          updatedAt: "2026-09-28T10:00:00.000Z",
        },
        message: "User access updated",
      }).as("updateAccess");

      cy.visit("/admin/users");
      cy.dataCy("user-row").eq(1).find('[data-cy="edit-access"]').click();
      cy.dataCy("user-access-dialog").should("be.visible");
      cy.dataCy("save-access").should("be.disabled");

      cy.dataCy("role-option-emergency_responder").click();
      cy.dataCy("scope-input").type(REGION);
      cy.dataCy("save-access").click();

      cy.wait("@updateAccess").its("request.body").should("deep.equal", {
        role: "emergency_responder",
        scopeAdminUnitId: REGION,
      });
      cy.dataCy("toast-success").should("contain", "is now Emergency Responder");
      cy.dataCy("user-access-dialog").should("not.be.visible");
      cy.dataCy("user-row").eq(1).find('[data-cy="role-badge"]').should("have.text", "Emergency Responder");
    });

    it("clears the region when switching to a role that can't have one", () => {
      cy.interceptApi("PATCH", `/users/${stubId(3)}/access`, { statusCode: 500 }).as("updateAccess");
      cy.visit("/admin/users");
      cy.dataCy("user-row").eq(2).find('[data-cy="edit-access"]').click();
      cy.dataCy("scope-input").should("have.value", REGION);
      cy.dataCy("role-option-researcher").click();
      cy.dataCy("scope-input").should("not.exist");
      cy.dataCy("save-access").click();
      cy.wait("@updateAccess").its("request.body").should("deep.equal", { role: "researcher", scopeAdminUnitId: null });
    });

    it("puts the server's validation errors next to the right field", () => {
      cy.interceptApi("PATCH", `/users/${stubId(2)}/access`, {
        statusCode: 400,
        message: "Validation failed",
        errors: [{ field: "scopeAdminUnitId", message: "Region not found" }],
      });
      cy.visit("/admin/users");
      cy.dataCy("user-row").eq(1).find('[data-cy="edit-access"]').click();
      cy.dataCy("role-option-government_official").click();
      cy.dataCy("scope-input").type(REGION);
      cy.dataCy("save-access").click();
      cy.dataCy("user-access-dialog").find('[data-cy="field-error"]').should("have.text", "Region not found");
    });

    it("catches a malformed region ID before sending anything", () => {
      cy.visit("/admin/users");
      cy.dataCy("user-row").eq(1).find('[data-cy="edit-access"]').click();
      cy.dataCy("role-option-emergency_responder").click();
      cy.dataCy("scope-input").type("obio-akpor");
      cy.dataCy("save-access").click();
      cy.dataCy("user-access-dialog").find('[data-cy="field-error"]').should("contain", "valid region ID");
    });

    it("shows the shared error state with a retry when the list fails to load", () => {
      cy.interceptApi("GET", "/users*", { statusCode: 403, message: "Your role is not permitted to perform this action" });
      cy.visit("/admin/users");
      cy.dataCy("error-state").should("contain", "Your role is not permitted");
      cy.dataCy("retry").should("be.visible");
    });
  });
});

describe("Your profile", () => {
  it("nudges an account with no name, then saves only the changed details", () => {
    cy.login("general_public").then((user) => {
      cy.interceptApi("PATCH", "/auth/me", {
        data: { ...user, displayName: "Ada Obi", organisation: "RSEMA" },
        message: "Profile updated",
      }).as("saveProfile");
    });
    cy.visit("/");
    cy.wait("@getMe");

    cy.dataCy("user-menu-trigger").click();
    cy.dataCy("profile-nudge").should("contain", "Add your name").click();
    cy.location("pathname").should("eq", "/account");

    cy.dataCy("profile-progress").should("contain", "0 of 4 done");
    cy.dataCy("profile-save").should("be.disabled");
    cy.dataCy("profile-name").type("Ada Obi");
    cy.dataCy("profile-organisation").type("RSEMA");
    cy.dataCy("profile-save").click();

    cy.wait("@saveProfile").its("request.body").should("deep.equal", { displayName: "Ada Obi", organisation: "RSEMA" });
    cy.dataCy("profile-hero").should("contain", "Ada Obi").and("contain", "RSEMA");
    cy.dataCy("profile-progress").should("contain", "2 of 4 done");
    cy.dataCy("profile-save").should("be.disabled");
  });

  it("puts the server's field errors next to the field", () => {
    cy.login("researcher", { user: { displayName: "Ada Obi" } });
    cy.interceptApi("PATCH", "/auth/me", {
      statusCode: 400,
      message: "Validation failed",
      errors: [{ field: "phone", message: "Enter a phone number using digits" }],
    });
    cy.visit("/account");
    // Passes the client check, so the server's answer is what shows.
    cy.dataCy("profile-phone").type("+234 000000");
    cy.dataCy("profile-save").click();
    cy.dataCy("field-error").should("contain", "Enter a phone number using digits");
  });
});

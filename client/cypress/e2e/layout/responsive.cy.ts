// Phones are a first-class target: responders check this in the field. No screen may scroll
// sideways at a 360px viewport (a small Android phone).
function expectNoHorizontalOverflow() {
  cy.document().then((doc) => {
    expect(doc.documentElement.scrollWidth, "page width").to.be.at.most(doc.documentElement.clientWidth);
  });
}

describe("Small screens", () => {
  beforeEach(() => {
    cy.viewport(360, 740);
  });

  it("fits the sign-in page", () => {
    cy.visit("/sign-in");
    cy.dataCy("sign-in-page").should("be.visible");
    expectNoHorizontalOverflow();
  });

  it("fits the overview", () => {
    cy.login("emergency_responder", { user: { scopeAdminUnitId: "8b0f7c1e-3f5a-4d2b-9c61-2f7e4a1b9d30" } });
    cy.visit("/");
    cy.dataCy("home-page").should("be.visible");
    expectNoHorizontalOverflow();
  });

  it("fits the user list, which turns into stacked cards", () => {
    cy.login("administrator");
    cy.interceptApi("GET", "/users*", { fixture: "users/list.json" });
    cy.visit("/admin/users");
    cy.dataCy("user-row").should("have.length", 3);
    expectNoHorizontalOverflow();
  });
});

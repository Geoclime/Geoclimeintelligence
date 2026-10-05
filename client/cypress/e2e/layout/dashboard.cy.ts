import { stubGeography } from "../../support/geo-factories";

// The signed-in frame: a sidebar on wide screens, a drawer on phones and tablets.
describe("Dashboard shell", () => {
  beforeEach(() => {
    stubGeography();
  });

  it("shows grouped navigation in a fixed sidebar on wide screens, with admin links for administrators", () => {
    cy.viewport(1280, 800);
    cy.login("administrator");
    cy.visit("/");
    cy.dataCy("sidebar").should("be.visible").and("contain", "Explore").and("contain", "Administration");
    ["map", "places", "users", "countries", "imports"].forEach((item) => cy.dataCy(`nav-${item}`).should("be.visible"));
    cy.dataCy("open-menu").should("not.be.visible");
  });

  it("hides the Administration group from other roles", () => {
    cy.viewport(1280, 800);
    cy.login("researcher");
    cy.visit("/");
    cy.dataCy("sidebar").should("not.contain", "Administration");
    cy.dataCy("nav-users").should("not.exist");
  });

  it("opens the sidebar as a drawer on phones and closes it after navigating", () => {
    cy.viewport(360, 740);
    cy.login("general_public");
    cy.interceptApi("GET", "/admin-units?*", { data: [], meta: { total: 0 } });
    cy.visit("/");
    cy.dataCy("sidebar").should("not.be.visible");
    cy.dataCy("open-menu").click();
    cy.dataCy("sidebar").should("be.visible");
    cy.dataCy("nav-places").click();
    cy.location("pathname").should("eq", "/places");
    cy.dataCy("sidebar").should("not.be.visible");
  });

  it("closes the drawer with Escape", () => {
    cy.viewport(390, 844);
    cy.login("general_public");
    cy.visit("/");
    cy.dataCy("open-menu").click();
    cy.dataCy("sidebar").should("be.visible");
    cy.get("body").type("{esc}");
    cy.dataCy("sidebar").should("not.be.visible");
  });

  it("opens the account page from the account menu", () => {
    cy.login("general_public");
    cy.visit("/");
    cy.dataCy("user-menu-trigger").click();
    cy.dataCy("account-link").click();
    cy.dataCy("account-page").should("be.visible");
    cy.dataCy("user-menu").should("not.be.visible");
  });
});

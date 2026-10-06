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

  it("collapses to an icon rail on wide screens, keeps every link usable and remembers the choice", () => {
    cy.viewport(1280, 800);
    cy.login("administrator");
    cy.visit("/");
    cy.dataCy("sidebar").invoke("outerWidth").should("eq", 248);

    cy.dataCy("sidebar-collapse").should("have.attr", "aria-label", "Collapse sidebar").click();
    cy.dataCy("sidebar").invoke("outerWidth").should("eq", 72);
    cy.dataCy("sidebar-collapse").should("have.attr", "aria-label", "Expand sidebar");
    // The labels are hidden from sight but still there for screen readers and as tooltips.
    cy.dataCy("nav-places").should("have.attr", "title", "Places").and("contain", "Places");
    ["map", "places", "users", "countries", "imports"].forEach((item) => cy.dataCy(`nav-${item}`).should("be.visible"));

    cy.dataCy("nav-places").click();
    cy.location("pathname").should("eq", "/places");
    cy.dataCy("sidebar").invoke("outerWidth").should("eq", 72);

    cy.reload();
    cy.dataCy("sidebar").invoke("outerWidth").should("eq", 72);

    cy.dataCy("sidebar-collapse").click();
    cy.dataCy("sidebar").invoke("outerWidth").should("eq", 248);
    cy.reload();
    cy.dataCy("sidebar").invoke("outerWidth").should("eq", 248);
  });

  it("ignores a collapsed setting in the phone drawer", () => {
    cy.viewport(360, 740);
    cy.login("general_public");
    cy.interceptApi("GET", "/admin-units?*", { data: [], meta: { total: 0 } });
    cy.visit("/", { onBeforeLoad: (win) => win.localStorage.setItem("geoclime:sidebar-collapsed", "true") });
    cy.dataCy("sidebar-collapse").should("not.be.visible");
    cy.dataCy("open-menu").click();
    cy.dataCy("sidebar").should("be.visible").invoke("outerWidth").should("be.greaterThan", 200);
    cy.dataCy("nav-places").find(".app-sidebar__label").should("be.visible").and("have.text", "Places");
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

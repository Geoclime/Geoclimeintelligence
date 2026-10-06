import { buildRun, buildStagingRow, OBIO_AKPOR, PORT_HARCOURT, stubGeography } from "../../support/geo-factories";

const RUN = buildRun();

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

  it("fits the account page", () => {
    cy.login("emergency_responder");
    cy.visit("/account");
    cy.dataCy("account-page").should("be.visible");
    expectNoHorizontalOverflow();
  });

  it("fits the home map, with the layers panel behind a button", () => {
    cy.login("general_public");
    stubGeography();
    cy.visit("/");
    cy.dataCy("map-overview").should("be.visible");
    cy.dataCy("layer-toggle").should("not.be.visible");
    cy.dataCy("toggle-map-panels").click();
    cy.dataCy("layer-toggle").should("be.visible");
    expectNoHorizontalOverflow();
  });

  it("fits the LGA directory and the import review", () => {
    cy.login("administrator");
    cy.interceptApi("GET", "/admin-units?*", { data: [OBIO_AKPOR, PORT_HARCOURT], meta: { total: 2 } });
    cy.visit("/places");
    cy.dataCy("lga-row").should("have.length", 2);
    expectNoHorizontalOverflow();

    const failedRow = buildStagingRow(62, { status: "failed", errors: ["The shape is missing"] });
    cy.interceptApi("GET", `/imports/${RUN.id}?*`, { data: { run: RUN, rows: [failedRow] }, meta: { total: 1 } });
    cy.interceptApi("GET", `/imports/${RUN.id}/geojson*`, { data: { type: "FeatureCollection", features: [] } });
    cy.visit(`/admin/imports/${RUN.id}`);
    cy.dataCy("staging-row").should("have.length", 1);
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

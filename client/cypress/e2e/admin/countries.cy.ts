import { buildCountry, buildUnit, STATE } from "../../support/geo-factories";

describe("Administrator: countries", () => {
  it("is hidden from, and refused to, non-administrators", () => {
    cy.login("emergency_responder");
    cy.visit("/admin/countries");
    cy.dataCy("forbidden").should("be.visible");
    cy.dataCy("nav-countries").should("not.exist");
  });

  describe("as an administrator", () => {
    beforeEach(() => {
      cy.login("administrator");
    });

    it("lists every country with its levels and area counts", () => {
      cy.interceptApi("GET", "/countries", { data: [buildCountry()] });
      cy.visit("/admin/countries");
      cy.dataCy("country-row").should("have.length", 1).and("contain", "Nigeria").and("contain", "NGA");
      cy.dataCy("country-row").should("contain", "LGA").and("contain", "23").and("contain", "317");
    });

    it("creates Nigeria with its three levels", () => {
      cy.interceptApi("GET", "/countries", { data: [] });
      cy.interceptApi("POST", "/countries", { statusCode: 201, data: buildCountry([0, 0, 0]), message: "Country created" }).as("create");
      cy.interceptApi("GET", "/countries/NGA", { data: buildCountry([0, 0, 0]) });
      cy.interceptApi("GET", "/admin-units?*", { data: [], meta: { total: 0 } });

      cy.visit("/admin/countries");
      cy.dataCy("add-country").click();
      cy.dataCy("country-code").type("nga");
      cy.dataCy("country-name").type("Nigeria");
      cy.dataCy("level-name-0").type("State");
      cy.dataCy("add-level").click();
      cy.dataCy("level-name-1").type("LGA");
      cy.dataCy("add-level").click();
      cy.dataCy("level-name-2").type("Ward");
      cy.dataCy("bbox-minLon").type("2.5");
      cy.dataCy("bbox-minLat").type("4.0");
      cy.dataCy("bbox-maxLon").type("14.8");
      cy.dataCy("bbox-maxLat").type("14.0");
      cy.dataCy("save-country").click();

      cy.wait("@create").its("request.body").should("deep.equal", {
        countryCode: "NGA",
        countryName: "Nigeria",
        levelNames: ["State", "LGA", "Ward"],
        bbox: [2.5, 4, 14.8, 14],
      });
      cy.location("pathname").should("eq", "/admin/countries/NGA");
      cy.dataCy("toast-success").should("contain", "Nigeria created");
    });

    it("checks the form before sending anything", () => {
      cy.visit("/admin/countries/new");
      cy.dataCy("country-code").type("NG");
      cy.dataCy("save-country").click();
      cy.dataCy("country-form").find('[data-cy="field-error"]').should("contain", "3-letter ISO");
    });

    it("puts the server's 409 on the form", () => {
      cy.interceptApi("POST", "/countries", { statusCode: 409, message: "A country with code NGA already exists" });
      cy.visit("/admin/countries/new");
      cy.dataCy("country-code").type("NGA");
      cy.dataCy("country-name").type("Nigeria");
      cy.dataCy("level-name-0").type("State");
      cy.dataCy("save-country").click();
      cy.dataCy("form-error").should("contain", "already exists");
    });

    it("renames a level, sending only what changed, and locks levels that hold areas", () => {
      cy.interceptApi("GET", "/countries/NGA", { data: buildCountry() });
      cy.interceptApi("PATCH", "/countries/NGA", { data: buildCountry(), message: "Country updated" }).as("update");
      cy.interceptApi("GET", "/admin-units?*", { data: [], meta: { total: 0 } });
      cy.visit("/admin/countries/NGA/edit");
      cy.dataCy("country-code").should("be.disabled");
      cy.dataCy("level-list").find('[aria-label="Remove level 3"]').should("be.disabled");
      cy.dataCy("level-name-1").clear().type("Local Government Area");
      cy.dataCy("save-country").click();
      cy.wait("@update").its("request.body").should("deep.equal", { levelNames: ["State", "Local Government Area", "Ward"] });
    });

    it("deletes a country that has no areas, after confirming", () => {
      cy.interceptApi("GET", "/countries/NGA", { data: buildCountry([0, 0, 0]) });
      cy.interceptApi("GET", "/admin-units?*", { data: [], meta: { total: 0 } });
      cy.interceptApi("DELETE", "/countries/NGA", { data: null, message: "Country deleted" }).as("delete");
      cy.interceptApi("GET", "/countries", { data: [] });
      cy.visit("/admin/countries/NGA");
      cy.dataCy("delete-blocked").should("not.exist");
      cy.dataCy("delete-country").click();
      cy.dataCy("delete-country-dialog").should("contain", "Delete Nigeria?");
      cy.dataCy("confirm-delete-country").click();
      cy.wait("@delete");
      cy.location("pathname").should("eq", "/admin/countries");
      cy.dataCy("toast-success").should("contain", "Nigeria deleted");
    });

    it("won't offer to delete a country that holds states, LGAs or wards", () => {
      cy.interceptApi("GET", "/countries/NGA", { data: buildCountry() });
      cy.interceptApi("GET", "/admin-units?*", { data: [STATE], meta: { total: 1 } });
      cy.visit("/admin/countries/NGA");
      cy.dataCy("delete-country").should("be.disabled");
      cy.dataCy("delete-blocked").should("contain", "holds 341 areas, so it can't be deleted");
    });

    it("shows a country's areas by level, with Import buttons preset to it", () => {
      cy.interceptApi("GET", "/countries/NGA", { data: buildCountry() });
      cy.interceptApi("GET", "/admin-units?*", { data: [STATE], meta: { page: 1, pageSize: 50, total: 1 } }, { query: { level: "1" } });
      cy.interceptApi(
        "GET",
        "/admin-units?*",
        { data: [buildUnit(1, { unitName: "Bonny" })], meta: { page: 1, pageSize: 50, total: 23 } },
        { query: { level: "2" } },
      ).as("lgas");
      cy.visit("/admin/countries/NGA");
      cy.dataCy("area-row").should("contain", "Rivers");
      cy.dataCy("level-card-2").click();
      cy.wait("@lgas").its("request.query").should("include", { countryCode: "NGA", level: "2" });
      cy.dataCy("import-areas").should("have.attr", "href", "/admin/imports/new?country=NGA&level=2");
    });
  });
});

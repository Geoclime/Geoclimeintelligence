import { stubId } from "../../support/factories";
import { buildCountry, buildFloodRiskLayer, buildRun, buildStagingRow, featureCollection, SOURCE, STATE, buildUnit } from "../../support/geo-factories";

const RUN_ID = stubId(800);

const lgaPreview = {
  fileName: "rivers_state_rainfall_and_boundaries.xlsx",
  fileType: "xlsx",
  sheets: ["rainfall", "lga_boundaries"],
  sheetName: "lga_boundaries",
  headerRow: 2,
  headings: ["lga_name_standard", "lga_name_source_geoboundaries", "state", "adm2_pcode", "geometry_wkt (EPSG:4326)"],
  rowCount: 23,
  sampleRows: [
    {
      lga_name_standard: "Abua-Odual",
      lga_name_source_geoboundaries: "Abua/Odual",
      state: "Rivers",
      adm2_pcode: "NG033001",
      "geometry_wkt (EPSG:4326)": "POLYGON ((6.57 4.70, … (4,755 characters)",
    },
  ],
  templateColumns: ["unit_name", "unit_code", "parent_code", "geometry_wkt"],
  suggestedMapping: {
    unit_name: "lga_name_standard",
    unit_code: "adm2_pcode",
    parent_code: "state",
    geometry_wkt: "geometry_wkt (EPSG:4326)",
  },
  warnings: [],
};

describe("Administrator: imports", () => {
  it("are refused to non-administrators", () => {
    cy.login("government_official");
    cy.visit("/admin/imports/new");
    cy.dataCy("forbidden").should("be.visible");
    cy.dataCy("nav-imports").should("not.exist");
  });

  describe("as an administrator", () => {
    beforeEach(() => {
      cy.login("administrator");
      cy.interceptApi("GET", "/countries", { data: [buildCountry([1, 0, 0])] });
      cy.interceptApi("GET", "/data-sources*", { data: [SOURCE], meta: { total: 1 } });
      cy.interceptApi("GET", "/admin-units?*", { data: [STATE], meta: { total: 1 } }, { query: { level: "1" } });
    });

    it("downloads the template for the chosen country and level", () => {
      cy.intercept(
        { method: "GET", url: "**/api/v1/imports/templates/admin-units*" },
        { statusCode: 200, body: "PK", headers: { "content-disposition": 'attachment; filename="admin-units-template_NGA_level-2-lga.xlsx"' } },
      ).as("template");
      cy.visit("/admin/imports/new?country=NGA&level=2");
      cy.dataCy("download-xlsx").click();
      cy.wait("@template").its("request.query").should("deep.equal", { country: "NGA", level: "2", format: "xlsx" });
      cy.dataCy("toast-success").should("contain", "Template downloaded");
    });

    it("reads the lga_boundaries sheet, matches its columns, and checks it", () => {
      cy.interceptApi("POST", "/imports/preview", { data: lgaPreview }).as("preview");
      cy.interceptApi("POST", "/imports", { statusCode: 201, data: buildRun({ fileName: lgaPreview.fileName, rowCount: 23, passedCount: 23, errorCount: 0 }) }).as("start");
      cy.interceptApi("GET", `/imports/${RUN_ID}*`, { data: { run: buildRun(), rows: [] }, meta: { total: 0 } });

      cy.visit("/admin/imports/new?country=NGA&level=2");
      cy.dataCy("import-source").select(SOURCE.id);
      cy.dataCy("import-file").selectFile(
        { contents: Cypress.Buffer.from("PK fake workbook"), fileName: "rivers_state_rainfall_and_boundaries.xlsx" },
      );
      cy.wait("@preview");
      cy.dataCy("file-summary").should("contain", "23").and("contain", "Headings in row 2");
      cy.dataCy("file-preview").should("contain", "Abua-Odual");
      cy.dataCy("map-unit_name").should("have.value", "lga_name_standard");
      cy.dataCy("map-geometry_wkt").should("have.value", "geometry_wkt (EPSG:4326)");
      cy.dataCy("map-parent_code").should("have.value", "state");
      cy.dataCy("start-import").click();

      cy.wait("@start").then(({ request }) => {
        const body = request.body as string;
        expect(request.headers["content-type"]).to.match(/multipart\/form-data/);
        expect(body).to.contain('name="sheetName"').and.contain("lga_boundaries");
        expect(body).to.contain('name="columnMapping"').and.contain('"geometry_wkt":"geometry_wkt (EPSG:4326)"');
        expect(body).to.contain('name="sourceId"').and.contain(SOURCE.id);
      });
      cy.location("pathname").should("eq", `/admin/imports/${RUN_ID}`);
    });

    it("explains a file the server can't read", () => {
      cy.interceptApi("POST", "/imports/preview", {
        statusCode: 400,
        message: "Validation failed",
        errors: [{ field: "file", message: "This file type isn't supported yet. Upload a shapefile, an Excel workbook, a GeoJSON file or a CSV file." }],
      });
      cy.visit("/admin/imports/new?country=NGA&level=2");
      cy.dataCy("import-file").selectFile({ contents: Cypress.Buffer.from("a,b"), fileName: "boundary.kml" });
      cy.dataCy("preview-error").should("contain", "Validation failed");
    });

    it("adds a data source from the import screen and selects it", () => {
      const created = { ...SOURCE, id: stubId(701), provider: "GRID3", datasetName: "Operational Wards v1.0" };
      cy.interceptApi("POST", "/data-sources", { statusCode: 201, data: created }).as("addSource");
      cy.visit("/admin/imports/new?country=NGA&level=3");
      cy.dataCy("add-source").click();
      cy.dataCy("source-provider").type("GRID3");
      cy.dataCy("source-dataset").type("Operational Wards v1.0");
      cy.dataCy("source-url").type("https://data.grid3.org");
      cy.dataCy("source-license").type("CC BY 4.0");
      cy.dataCy("source-date").type("2026-09-22");
      cy.dataCy("save-source").click();
      cy.wait("@addSource").its("request.body").should("include", { provider: "GRID3", downloadedOn: "2026-09-22" });
      cy.dataCy("import-source").should("have.value", created.id);
    });

    it("reviews a run: failed rows with reasons, the preview map, and promote", () => {
      const failed = buildStagingRow(62, { status: "failed", unitName: "Omward 5", hasShape: false, errors: ["The shape is missing"] });
      cy.interceptApi("GET", `/imports/${RUN_ID}?*`, { data: { run: buildRun(), rows: [buildStagingRow(1), failed] }, meta: { page: 1, pageSize: 50, total: 318 } });
      cy.interceptApi("GET", `/imports/${RUN_ID}?*`, { data: { run: buildRun(), rows: [failed] }, meta: { page: 1, pageSize: 50, total: 1 } }, { query: { status: "failed" } }).as("failedRows");
      cy.interceptApi("GET", `/imports/${RUN_ID}/geojson*`, { data: featureCollection([buildUnit(1)]) }).as("stagedShapes");
      cy.interceptApi("POST", `/imports/${RUN_ID}/promote`, { data: buildRun({ status: "promoted", promotedCount: 317 }) }).as("promote");

      cy.visit(`/admin/imports/${RUN_ID}`);
      cy.dataCy("passed-count").should("have.text", "317");
      cy.dataCy("failed-count").should("have.text", "1");
      cy.wait("@stagedShapes").its("request.query").should("have.property", "bbox");
      cy.dataCy("filter-failed").click();
      cy.wait("@failedRows");
      cy.dataCy("staging-row").should("have.length", 1).and("contain", "Omward 5").and("contain", "The shape is missing");

      cy.dataCy("promote").should("contain", "Promote 317 areas").click();
      cy.dataCy("promote-dialog").should("contain", "1 failed rows will be left out");
      cy.dataCy("confirm-promote").click();
      cy.wait("@promote");
      cy.dataCy("toast-success").should("contain", "317 Ward areas are now live");
      cy.dataCy("promote").should("be.disabled").and("contain", "Promoted");
    });

    describe("the flood risk map", () => {
      const floodRun = (overrides: Record<string, unknown> = {}) =>
        buildRun({
          target: "flood_risk_layers",
          fileName: "flood_risk_map.tif",
          fileType: "geotiff",
          options: { countryCode: "NGA", dataType: "DERIVED", title: "flood_risk_map" },
          columnMapping: {},
          rowCount: 3,
          passedCount: 3,
          errorCount: 0,
          promotableCount: 3,
          warnings: ["Read a 1,323 x 1,558 map of 100 m cells (EPSG:32632): 10,341.4 km2 classified, measured in 3 areas."],
          ...overrides,
        });
      const riskRow = (rowNumber: number, name: string, risk: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
        buildStagingRow(rowNumber, { unitName: name, unitCode: null, parentRef: null, parentName: null, hasShape: false, risk, ...extra });

      it("is chosen on the import screen, and uploaded as a GeoTIFF with its country and source", () => {
        // The LGAs have to be live first: the map is measured per LGA and ward.
        cy.interceptApi("GET", "/countries", { data: [buildCountry()] });
        cy.interceptApi("POST", "/imports/flood-risk", { statusCode: 201, data: floodRun() }).as("startFloodRisk");
        cy.interceptApi("GET", `/imports/${RUN_ID}?*`, { data: { run: floodRun(), rows: [] }, meta: { total: 0 } });

        cy.visit("/admin/imports/new?country=NGA&level=flood-risk");
        cy.dataCy("flood-risk-note").should("contain", "classified flood risk map").and("contain", "derived");
        cy.dataCy("import-source").select(SOURCE.id);
        cy.dataCy("import-file").selectFile({ contents: Cypress.Buffer.from("II*"), fileName: "flood_risk_map.tif" });
        cy.dataCy("flood-risk-ready").should("contain", "flood_risk_map.tif");
        cy.dataCy("start-import").click();

        cy.wait("@startFloodRisk").then(({ request }) => {
          const body = request.body as string;
          expect(request.headers["content-type"]).to.match(/multipart\/form-data/);
          expect(body).to.contain('name="countryCode"').and.contain("NGA");
          expect(body).to.contain('name="sourceId"').and.contain(SOURCE.id);
          expect(body).to.contain('name="file"').and.contain("flood_risk_map.tif");
        });
        cy.location("pathname").should("eq", `/admin/imports/${RUN_ID}`);
      });

      it("is not offered until the LGAs are live", () => {
        cy.visit("/admin/imports/new?country=NGA");
        cy.dataCy("import-level").find("option[value='flood-risk']").should("be.disabled");
      });

      it("is reviewed on its own map, with how each LGA and ward divides into classes, then promoted", () => {
        const rows = [
          riskRow(1, "Port Harcourt", { levelName: "LGA", areaKm2: 123.4, percentHigh: 97.1, meanClass: 4.2 }),
          riskRow(2, "Obio-Akpor", { levelName: "LGA", areaKm2: 260.5, percentHigh: 12.3, meanClass: 2.9 }),
          riskRow(3, "Rumuokoro", { levelName: "Ward", areaKm2: 8.1, percentHigh: null, meanClass: null }, { parentName: "Obio-Akpor", warnings: ["The map has no data inside this area (open water, or beyond the map's edge)."] }),
        ];
        cy.interceptApi("GET", `/imports/${RUN_ID}?*`, { data: { run: floodRun(), rows }, meta: { page: 1, pageSize: 50, total: 3 } });
        cy.interceptApi("GET", `/imports/${RUN_ID}/flood-risk`, { data: buildFloodRiskLayer({ status: "staged", promotedAt: null }) }).as("runFloodRisk");
        cy.interceptApi("GET", "/flood-risk/layers/*/image", { fixture: "map/flood-risk.png" });
        cy.interceptApi("POST", `/imports/${RUN_ID}/promote`, { data: floodRun({ status: "promoted", promotedCount: 3 }) }).as("promote");

        cy.visit(`/admin/imports/${RUN_ID}`);
        cy.wait("@runFloodRisk");
        cy.dataCy("import-preview-map").should("be.visible");
        cy.dataCy("flood-risk-summary").should("contain", "Very high").and("contain", "1,606.52 km²").and("contain", "15.5%");
        cy.dataCy("staging-table").should("contain", "High or very high").and("contain", "Mean class");
        cy.dataCy("staging-row").first().should("contain", "Port Harcourt").and("contain", "97.1%");
        cy.dataCy("staging-row").last().should("contain", "Rumuokoro").and("contain", "No data").and("contain", "no data inside this area");

        cy.dataCy("promote").should("contain", "Promote the map").click();
        cy.dataCy("promote-dialog").should("contain", "Make this flood risk map live?").and("contain", "replacing the current map");
        cy.dataCy("confirm-promote").click();
        cy.wait("@promote");
        cy.dataCy("toast-success").should("contain", "The flood risk map is now live, with figures for 3 areas");
        cy.dataCy("promote").should("be.disabled").and("contain", "Promoted");
        cy.dataCy("promoted-next").should("contain", "Flood risk");
      });

      it("shows in the import history as a flood risk map", () => {
        cy.interceptApi("GET", "/imports?*", { data: [floodRun()], meta: { page: 1, pageSize: 25, total: 1 } });
        cy.visit("/admin/imports");
        cy.dataCy("import-run-row").first().should("contain", "Flood risk map").and("contain", "NGA").and("contain", "3/3 passed");
      });
    });

    it("shows the server's 409 when a run was already promoted elsewhere", () => {
      cy.interceptApi("GET", `/imports/${RUN_ID}?*`, { data: { run: buildRun(), rows: [] }, meta: { total: 0 } });
      cy.interceptApi("GET", `/imports/${RUN_ID}/geojson*`, { data: featureCollection([]) });
      cy.interceptApi("POST", `/imports/${RUN_ID}/promote`, { statusCode: 409, message: "This import has already been promoted" });
      cy.visit(`/admin/imports/${RUN_ID}`);
      cy.dataCy("promote").click();
      cy.dataCy("confirm-promote").click();
      cy.dataCy("toast-error").should("contain", "already been promoted");
    });

    it("lists past imports with who ran them and their status", () => {
      cy.interceptApi("GET", "/imports?*", {
        data: [buildRun({ status: "promoted", promotedCount: 317 }), buildRun({ id: stubId(801), fileName: "rivers_state_boundary.geojson", passedCount: 1, rowCount: 1, errorCount: 0 })],
        meta: { page: 1, pageSize: 25, total: 2 },
      });
      cy.visit("/admin/imports");
      cy.dataCy("import-run-row").should("have.length", 2);
      cy.dataCy("import-run-row").first().should("contain", "317/318 passed").and("contain", "Promoted").and("contain", "Ada Admin");
    });
  });
});

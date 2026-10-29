import { stubId } from "../../support/factories";
import { OBIO_AKPOR, PORT_HARCOURT, STATE, WARD, buildUnit, detail, featureCollection } from "../../support/geo-factories";

/** 2024-01 to 2026-08 with a value (every August 300 mm except 2026's 330), then an incomplete September 2026. */
function rainfallSeries() {
  const months: { yearMonth: string; rainfallMm: number | null }[] = [];
  for (let i = 0; i < 32; i++) {
    const yearMonth = `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
    months.push({ yearMonth, rainfallMm: yearMonth === "2026-08" ? 330 : yearMonth.endsWith("-08") ? 300 : 100 });
  }
  months.push({ yearMonth: "2026-09", rainfallMm: null });
  return {
    adminUnit: { id: PORT_HARCOURT.id, countryCode: "NGA", level: 2, levelName: "LGA", unitName: "Port Harcourt", unitCode: "NG033022" },
    months,
    dataTypes: ["OBSERVED"],
    sources: [
      {
        id: stubId(500),
        provider: "Climate Hazards Center",
        datasetName: "CHIRPS v2.0 monthly",
        url: "https://www.chc.ucsb.edu/data/chirps",
        license: "CC BY 4.0",
        downloadedOn: "2026-10-29",
        notes: null,
        createdAt: "2026-10-29T00:00:00.000Z",
      },
    ],
  };
}

describe("Places", () => {
  beforeEach(() => {
    cy.login("general_public");
  });

  describe("LGA directory", () => {
    it("lists the LGAs with their ward counts and links to each profile", () => {
      cy.interceptApi("GET", "/admin-units?*", { data: [OBIO_AKPOR, PORT_HARCOURT], meta: { page: 1, pageSize: 100, total: 2 } }).as("getLgas");
      cy.visit("/places");
      cy.wait("@getLgas").its("request.query").should("include", { level: "2" });
      cy.dataCy("lga-row").should("have.length", 2);
      cy.dataCy("lga-row").first().should("contain", "Obio-Akpor").and("contain", "NG033015");
      cy.dataCy("lga-row").eq(1).find("a").first().should("have.attr", "href", `/places/${PORT_HARCOURT.id}`);
    });

    it("searches on the server once typing settles", () => {
      cy.interceptApi("GET", "/admin-units?*", { data: [OBIO_AKPOR, PORT_HARCOURT], meta: { total: 2 } });
      cy.interceptApi("GET", "/admin-units?*", { data: [PORT_HARCOURT], meta: { total: 1 } }, { query: { q: "port" } }).as("search");
      cy.visit("/places");
      cy.dataCy("lga-search").type("port");
      cy.wait("@search");
      cy.dataCy("lga-row").should("have.length", 1).and("contain", "Port Harcourt");
    });

    it("says honestly when nothing is loaded yet", () => {
      cy.interceptApi("GET", "/admin-units?*", { data: [], meta: { total: 0 } });
      cy.visit("/places");
      cy.dataCy("empty-state").should("contain", "No LGAs loaded yet");
    });
  });

  describe("LGA profile", () => {
    beforeEach(() => {
      cy.interceptApi("GET", `/admin-units/${PORT_HARCOURT.id}`, { data: detail(PORT_HARCOURT, STATE) }).as("getLga");
      cy.interceptApi("GET", `/admin-units/${PORT_HARCOURT.id}/children*`, {
        data: [WARD, buildUnit(202, { level: 3, levelName: "Ward", unitName: "Phward 18", parentId: PORT_HARCOURT.id })],
        meta: { page: 1, pageSize: 100, total: 2 },
      }).as("getWards");
      cy.interceptApi("GET", "/admin-units/geojson?*", { data: featureCollection([WARD]) }, { query: { level: "3" } }).as("wardShapes");
      cy.interceptApi("GET", "/rainfall?*", { data: rainfallSeries() }).as("getRainfall");
    });

    it("shows the latest month and the last 12 months against their averages, with a table view", () => {
      cy.visit(`/places/${PORT_HARCOURT.id}`);
      cy.wait("@getRainfall").its("request.query").should("include", { adminUnitId: PORT_HARCOURT.id });
      // August 2026 is 330 mm; the August average of 2024-2025 is 300 mm.
      cy.dataCy("rainfall-stats").should("contain", "August 2026").and("contain", "330 mm").and("contain", "10% wetter than an average August (2024–2025)");
      cy.dataCy("rainfall-incomplete").should("contain", "September 2026 is not complete in the source yet");
      cy.dataCy("rainfall-card").find("summary").first().click();
      cy.dataCy("rainfall-card").find("details").first().find("tbody tr").should("have.length", 12).first().should("contain", "August 2026").and("contain", "330 mm");
      cy.dataCy("rainfall-card").should("contain", "Observed").and("contain", "CHIRPS");
    });

    it("shows any year's months, chosen from the list or from the year-by-year chart", () => {
      cy.visit(`/places/${PORT_HARCOURT.id}`);
      cy.dataCy("rainfall-period").select("2024");
      // 2024: eleven months of 100 mm and an August of 300 mm.
      cy.dataCy("rainfall-period-total").should("contain", "2024 total: 1,400 mm");
      cy.dataCy("rainfall-period").select("2026 (incomplete)");
      cy.dataCy("rainfall-period-total").should("contain", "2026 so far: 1,030 mm over 8 months");
      cy.get('[aria-label^="2025 total"]').click();
      cy.dataCy("rainfall-period").should("have.value", "2025");
      cy.dataCy("rainfall-years").find("tbody tr").should("have.length", 3);
    });

    it("says so when no rainfall is loaded for the LGA", () => {
      cy.interceptApi("GET", "/rainfall?*", { data: { ...rainfallSeries(), months: [], dataTypes: [], sources: [] } });
      cy.visit(`/places/${PORT_HARCOURT.id}`);
      cy.dataCy("rainfall-card").should("contain", "No rainfall is loaded for Port Harcourt yet");
    });

    it("shows the LGA's code, parent, source and clickable wards", () => {
      cy.visit(`/places/${PORT_HARCOURT.id}`);
      cy.wait(["@getLga", "@getWards"]);
      cy.dataCy("lga-profile-page").find("h1").should("have.text", "Port Harcourt");
      cy.dataCy("lga-details").should("contain", "NG033022");
      cy.dataCy("source-badge").should("contain", "geoBoundaries").and("contain", "CC BY 4.0");
      cy.dataCy("ward-link").should("have.length", 2).first().click();
      cy.location("pathname").should("eq", `/places/${PORT_HARCOURT.id}/wards/${WARD.id}`);
    });

    it("asks for its wards' shapes only inside the LGA's own box", () => {
      cy.visit(`/places/${PORT_HARCOURT.id}`);
      cy.wait("@wardShapes").its("request.query").should("include", { level: "3", parentId: PORT_HARCOURT.id });
    });

    it("shows a not-found state for an unknown area", () => {
      cy.interceptApi("GET", `/admin-units/${stubId(999)}`, { statusCode: 404, message: "Admin unit not found" });
      cy.visit(`/places/${stubId(999)}`);
      cy.dataCy("empty-state").should("contain", "couldn't find that place");
    });
  });

  describe("Ward view", () => {
    it("shows the ward with its parent LGA and source", () => {
      cy.interceptApi("GET", `/admin-units/${WARD.id}`, { data: detail(WARD, PORT_HARCOURT) });
      cy.interceptApi("GET", `/admin-units/${PORT_HARCOURT.id}`, { data: detail(PORT_HARCOURT, STATE) });
      cy.visit(`/places/${PORT_HARCOURT.id}/wards/${WARD.id}`);
      cy.dataCy("ward-page").find("h1").should("have.text", "Phward 17");
      cy.dataCy("breadcrumbs").should("contain", "Places").and("contain", "Port Harcourt");
      cy.dataCy("ward-details").should("contain", "RVSPHC17");
      cy.dataCy("source-badge").should("be.visible");
    });

    it("won't show a ward under the wrong LGA's address", () => {
      cy.interceptApi("GET", `/admin-units/${WARD.id}`, { data: detail(WARD, PORT_HARCOURT) });
      cy.interceptApi("GET", `/admin-units/${OBIO_AKPOR.id}`, { data: detail(OBIO_AKPOR, STATE) });
      cy.visit(`/places/${OBIO_AKPOR.id}/wards/${WARD.id}`);
      cy.dataCy("empty-state").should("contain", "couldn't find that ward");
    });
  });
});

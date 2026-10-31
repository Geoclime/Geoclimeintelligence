import { OBIO_AKPOR, PORT_HARCOURT, SOURCE, STATE, WARD, featureCollection, stubGeography, type StubUnit } from "../../support/geo-factories";

// The public landing page at "/": everything here works signed out, against /api/v1/public.

const ref = ({ id, countryCode, level, levelName, unitName, unitCode }: StubUnit) => ({ id, countryCode, level, levelName, unitName, unitCode });

const overview = {
  states: [{ id: STATE.id, countryCode: "NGA", unitName: "Rivers", levelName: "State" }],
  areas: [
    { level: 1, levelName: "State", count: 1 },
    { level: 2, levelName: "LGA", count: 23 },
    { level: 3, levelName: "Ward", count: 317 },
  ],
  layers: [
    { id: "roads", label: "Roads", featureCount: 47507 },
    { id: "waterways", label: "Waterways", featureCount: 4033 },
    { id: "settlements", label: "Settlements", featureCount: 1149 },
    { id: "infrastructure", label: "Infrastructure", featureCount: 821 },
    { id: "buildings", label: "Buildings", featureCount: 406430 },
  ],
  rainfall: { firstMonth: "2016-01", lastMonth: "2026-08", areaCount: 23 },
  sources: [{ id: SOURCE.id, provider: SOURCE.provider, datasetName: SOURCE.datasetName, url: SOURCE.url, license: SOURCE.license }],
  generatedAt: "2026-10-30T09:00:00.000Z",
};

/** Three years of monthly rainfall, 2025 the wettest, so every comparison has an average (two other years) behind it. */
const months = [2023, 2024, 2025].flatMap((year) =>
  Array.from({ length: 12 }, (_, i) => ({ yearMonth: `${year}-${String(i + 1).padStart(2, "0")}`, rainfallMm: 100 + i * 20 + (year === 2025 ? 30 : 0) })),
);

const portHarcourtArea = {
  area: { ...ref(PORT_HARCOURT), parentId: STATE.id, childCount: 2, bbox: PORT_HARCOURT.bbox, centroid: PORT_HARCOURT.centroid },
  parents: [ref(STATE)],
  rainfall: {
    adminUnit: ref(PORT_HARCOURT),
    months,
    dataTypes: ["OBSERVED"],
    sources: [{ ...SOURCE, provider: "Climate Hazards Center", datasetName: "CHIRPS v2.0" }],
  },
};

const noAlerts = { alerts: [], reports: [], reportDays: 7, floods: [], floodDays: 3, generatedAt: "2026-10-30T09:00:00.000Z" };

function stubPublic(alertMap: object = noAlerts) {
  cy.interceptApi("GET", "/public/alert-map", { data: alertMap }).as("getAlertMap");
  cy.interceptApi("GET", "/public/overview", { data: overview }).as("getOverview");
  cy.interceptApi("GET", "/public/outline", { data: { bbox: STATE.bbox, areas: featureCollection([PORT_HARCOURT, OBIO_AKPOR]) } }).as("getOutline");
  cy.interceptApi("GET", `/public/areas/${PORT_HARCOURT.id}`, { data: portHarcourtArea }).as("getArea");
}

describe("Landing page", () => {
  it("opens signed out, with the live figures, the data sources and the ways in", () => {
    stubPublic();
    cy.visit("/");
    cy.wait(["@getOverview", "@getOutline"]);
    cy.location("pathname").should("eq", "/");
    cy.get("h1").should("contain", "Climate and disaster intelligence for Nigeria");
    cy.dataCy("landing-facts").should("contain", "Live in Rivers State").and("contain", "23 LGAs").and("contain", "317 Wards").and("contain", "Rainfall since January 2016");
    cy.dataCy("coverage-stats").should("contain", "406,430").and("contain", "Buildings").and("contain", "128").and("contain", "Months of rainfall");
    cy.dataCy("landing-sources").should("contain", SOURCE.provider).and("contain", "CC BY 4.0");
    cy.dataCy("landing-sign-in").should("have.attr", "href", "/sign-in");
    cy.dataCy("landing-sign-up").should("have.attr", "href", "/sign-up");
    cy.dataCy("state-outline-area").should("have.length", 2);
  });

  it("finds an LGA by name and summarises its rainfall without an account", () => {
    stubPublic();
    cy.interceptApi("GET", "/public/search*", { data: { areas: [{ ...ref(PORT_HARCOURT), parentName: "Rivers" }], communities: [] } }).as("search");
    cy.visit("/");
    cy.dataCy("place-finder-input").type("port");
    cy.wait("@search").its("request.url").should("contain", "q=port");
    cy.dataCy("place-finder-results").contains("Port Harcourt").click();

    cy.wait("@getArea");
    cy.dataCy("place-summary").within(() => {
      cy.get("h3").should("have.text", "Port Harcourt");
      cy.contains("In Rivers State");
      cy.contains("Last 12 months");
      cy.contains("wetter than usual");
      cy.contains("does not tell you whether an area will flood");
      cy.dataCy("place-summary-profile").should("contain", "Sign in for the full profile").and("have.attr", "href", `/places/${PORT_HARCOURT.id}`);
    });
  });

  it("places a community in its LGA and ward", () => {
    stubPublic();
    cy.interceptApi("GET", "/public/search*", {
      data: { areas: [], communities: [{ id: "c1", name: "Borokiri", isPrimary: true, point: [7.03, 4.75] }] },
    });
    cy.interceptApi("GET", "/public/locate*", { data: { point: [7.03, 4.75], units: [ref(STATE), ref(PORT_HARCOURT), ref(WARD)] } }).as("locate");
    cy.visit("/");
    cy.dataCy("place-finder-input").type("boro");
    cy.dataCy("place-finder-results").contains("Borokiri").click();
    cy.wait("@locate");
    cy.dataCy("place-summary").should("contain", "Borokiri is in Port Harcourt LGA, Phward 17 ward.");
  });

  it("looks up an LGA clicked on the outline", () => {
    stubPublic();
    cy.visit("/");
    cy.wait("@getOutline");
    cy.dataCy("state-outline-area").first().click();
    cy.wait("@getArea");
    cy.dataCy("place-summary").should("contain", "Port Harcourt");
  });

  it("says so, with a retry, when the live figures can't be loaded", () => {
    cy.interceptApi("GET", "/public/alert-map", { data: noAlerts });
    cy.interceptApi("GET", "/public/overview", { statusCode: 500, message: "Something went wrong" });
    cy.interceptApi("GET", "/public/outline", { data: { bbox: null, areas: { type: "FeatureCollection", features: [] } } });
    cy.visit("/");
    cy.get("#coverage").should("contain", "The live figures couldn't be loaded").find("button").should("contain", "Try again");
  });

  it("offers the map, not sign-in, to a signed-in visitor", () => {
    cy.login("general_public");
    stubPublic();
    cy.visit("/");
    cy.wait("@getMe");
    cy.dataCy("landing-open-map").should("have.attr", "href", "/map");
    cy.dataCy("landing-sign-in").should("not.exist");
  });

  it("shows the alerts in force, coloured on the map, with a live status line", () => {
    stubPublic({
      ...noAlerts,
      alerts: [
        {
          id: "alert-1",
          severity: "warning",
          status: "active",
          title: "River Bonny rising",
          message: "Water levels are rising after two days of heavy rain.",
          actions: ["Move valuables to higher ground."],
          startsAt: "2026-10-30T06:00:00.000Z",
          expiresAt: "2026-10-31T06:00:00.000Z",
          endedAt: null,
          areas: [{ id: PORT_HARCOURT.id, unitName: "Port Harcourt", levelName: "LGA", level: 2 }],
          lgaIds: [PORT_HARCOURT.id],
          createdAt: "2026-10-30T06:00:00.000Z",
        },
      ],
      reports: [{ id: "r1", point: [7.0, 4.8], waterDepth: "knee", lgaName: "Port Harcourt", createdAt: "2026-10-30T08:00:00.000Z" }],
    });
    cy.visit("/");
    cy.wait("@getAlertMap");
    cy.dataCy("alert-strip").should("contain", "1 flood alert in force").and("contain", "flood warning");
    cy.dataCy("landing-alerts").should("contain", "River Bonny rising").and("contain", "Move valuables to higher ground.");
    cy.get(".alert-map__area--warning").should("have.length", 1);
    cy.get(".alert-map__report").should("have.length", 1);
    cy.dataCy("landing-report-flooding").should("have.attr", "href", "/report").and("contain", "Sign in to report flooding");
  });

  it("does not call it all-clear when community reports are published and no alert is in force", () => {
    stubPublic({
      ...noAlerts,
      reports: [
        { id: "r1", point: [7.0, 4.8], waterDepth: "waist", lgaName: "Emohua", createdAt: "2026-10-30T17:39:00.000Z" },
        { id: "r2", point: [7.07, 4.83], waterDepth: "chest", lgaName: "Obio-Akpor", createdAt: "2026-10-30T23:54:00.000Z" },
      ],
    });
    cy.visit("/");
    cy.wait("@getAlertMap");
    cy.dataCy("alert-strip")
      .should("have.class", "alert-strip--reports")
      .and("contain", "No official flood alerts in force")
      .and("contain", "2 community flood reports")
      .and("contain", "the deepest chest-deep");
    cy.dataCy("alert-strip").should("not.contain", "No flood alerts in force right now");
  });

  it("says plainly when no alerts are in force", () => {
    stubPublic();
    cy.visit("/");
    cy.dataCy("alert-strip").should("contain", "No flood alerts in force");
    cy.dataCy("no-alerts").should("be.visible");
  });

  it("forwards a map link from before the map moved to /map", () => {
    cy.login("general_public");
    stubGeography();
    cy.visit("/?lng=7.0&lat=4.85&z=8");
    cy.location("pathname").should("eq", "/map");
    cy.location("search").should("contain", "lng=7.0").and("contain", "z=8");
  });
});

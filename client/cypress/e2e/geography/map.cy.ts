import { OBIO_AKPOR, PORT_HARCOURT, STATE, WARD, stubGeography } from "../../support/geo-factories";

const locateReply = {
  point: [7.0134, 4.7774],
  units: [STATE, PORT_HARCOURT, WARD].map(({ id, countryCode, level, levelName, unitName, unitCode }) => ({
    id,
    countryCode,
    level,
    levelName,
    unitName,
    unitCode,
  })),
};

/** Replaces the browser's geolocation with a fixed answer, before the app loads. */
function stubGeolocation(win: Window, coords: { longitude: number; latitude: number } | "denied") {
  cy.stub(win.navigator.geolocation, "getCurrentPosition").callsFake((ok: PositionCallback, fail: PositionErrorCallback) => {
    if (coords === "denied") fail({ code: 1, message: "denied" } as GeolocationPositionError);
    else ok({ coords: { ...coords, accuracy: 10 }, timestamp: Date.now() } as GeolocationPosition);
  });
}

describe("Home map", () => {
  beforeEach(() => {
    cy.login("general_public");
    stubGeography();
  });

  it("shows Rivers State with its LGA and ward counts, the layer switcher and the legend", () => {
    cy.visit("/");
    cy.wait(["@getCountries", "@getStates"]);
    cy.dataCy("map-page").should("be.visible");
    cy.dataCy("map-overview").should("contain", "Rivers State").and("contain", "23 LGAs · 317 Wards");
    cy.dataCy("layer-toggle").should("contain", "State").and("contain", "LGAs").and("contain", "Wards");
    cy.dataCy("layer-toggle").should("not.contain", "Rainfall");
    cy.dataCy("map-legend").should("contain", "LGA boundary");
  });

  it("fetches each layer only for the visible area, and wards only when zoomed in", () => {
    cy.visit("/?lng=7.0&lat=4.85&z=8");
    cy.wait("@lgaLayer").its("request.query.bbox").should("match", /^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/);
    cy.dataCy("layer-ward").should("contain", "Zoom in to see wards");

    cy.visit("/?lng=7.0&lat=4.8&z=11");
    cy.wait("@wardLayer").its("request.query").should("include", { level: "3" });
  });

  it("keeps layer choices in the address so a link opens the same view", () => {
    cy.visit("/?lng=7.0134&lat=4.7774&z=9.5");
    cy.dataCy("layer-lga").find("input").uncheck();
    cy.location("search").should("contain", "layers=state%2Cward");
    cy.location("search").should("contain", "z=9.5");
  });

  it("shows the selected LGA from the link, with a link to its profile", () => {
    cy.visit(`/?lga=${PORT_HARCOURT.id}`);
    cy.dataCy("selected-lga").should("contain", "Port Harcourt").and("contain", "2 wards");
    cy.dataCy("open-lga-profile").should("have.attr", "href", `/places/${PORT_HARCOURT.id}`);
  });

  it('"Where am I?" finds the ward and LGA you are standing in', () => {
    cy.interceptApi("GET", "/admin-units/locate*", { data: locateReply }).as("locate");
    cy.visit("/", { onBeforeLoad: (win) => stubGeolocation(win, { longitude: 7.0134, latitude: 4.7774 }) });
    cy.dataCy("where-am-i").click();
    cy.wait("@locate").its("request.query").should("deep.equal", { lon: "7.0134", lat: "4.7774" });
    cy.dataCy("selected-lga").should("contain", "Port Harcourt");
    cy.location("search").should("contain", `lga=${PORT_HARCOURT.id}`);
  });

  it("explains when location permission is refused", () => {
    cy.visit("/", { onBeforeLoad: (win) => stubGeolocation(win, "denied") });
    cy.dataCy("where-am-i").click();
    cy.dataCy("geo-error").should("contain", "permission was denied");
  });

  it("offers administrators a way to set up the first country when none exists", () => {
    cy.login("administrator");
    cy.interceptApi("GET", "/countries", { data: [] });
    cy.interceptApi("GET", "/admin-units?*", { data: [], meta: { total: 0 } });
    cy.visit("/");
    cy.dataCy("map-empty").should("contain", "Set up your first country");
    cy.dataCy("setup-first-country").should("have.attr", "href", "/admin/countries/new");
  });

  it("tells everyone else that no data is loaded yet", () => {
    cy.interceptApi("GET", "/countries", { data: [] });
    cy.interceptApi("GET", "/admin-units?*", { data: [], meta: { total: 0 } });
    cy.visit("/");
    cy.dataCy("map-empty").should("contain", "No map data yet");
    cy.dataCy("setup-first-country").should("not.exist");
  });

  it("names a broken layer instead of failing silently", () => {
    cy.interceptApi("GET", "/admin-units/geojson?*", { statusCode: 500, message: "Something went wrong" }, { query: { level: "2" } });
    cy.visit("/");
    cy.dataCy("layer-error").should("contain", "Something went wrong");
  });

  it("is reachable from the sidebar and keeps other links working", () => {
    cy.interceptApi("GET", "/admin-units?*", { data: [OBIO_AKPOR], meta: { page: 1, pageSize: 100, total: 1 } }, { query: { level: "2" } });
    cy.visit("/places");
    cy.dataCy("nav-map").click();
    cy.location("pathname").should("eq", "/");
    cy.dataCy("nav-map").should("have.class", "active");
  });
});

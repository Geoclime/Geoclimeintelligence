import { PORT_HARCOURT, STATE, WARD, stubGeography } from "../../support/geo-factories";

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

const savedPlace = {
  id: "50000000-0000-4000-8000-000000000001",
  name: "St. Mary's Hospital",
  facilityType: "health",
  osmClass: "hospital",
  note: "Has a 24-hour emergency ward",
  origin: "manual",
  longitude: 7.0134,
  latitude: 4.7774,
  adminUnitId: WARD.id,
  createdAt: "2026-10-31T10:00:00.000Z",
};

// A pinned-place link opens the same popup a map click does, without clicking the WebGL canvas.
const SPOT = "/map?lng=7.0134&lat=4.7774&z=17&pin=7.01340%2C4.77740&pinLabel=You+are+here";

// Layer requests wait for the map's own load event (see map.cy.ts), so allow the same extra time.
describe("Saving a place from the map", { defaultCommandTimeout: 10000 }, () => {
  beforeEach(() => {
    stubGeography();
    cy.interceptApi("GET", "/admin-units/locate*", { data: locateReply }).as("locate");
  });

  it("offers an administrator to save the spot, saves it, and draws the facilities again", () => {
    cy.login("administrator");
    cy.interceptApi("POST", "/infrastructure", { statusCode: 201, data: savedPlace, message: "Place saved" }).as("savePlace");
    cy.visit(SPOT);
    cy.wait("@locate");
    cy.wait("@infrastructureLayer");

    cy.dataCy("save-place-here").should("be.visible").click();
    cy.dataCy("place-dialog").should("be.visible").and("contain", "Phward 2");
    cy.dataCy("place-name").type("  St. Mary's Hospital ");
    cy.dataCy("place-kind").select("hospital");
    cy.dataCy("place-note").type("Has a 24-hour emergency ward");
    cy.dataCy("save-place").click();

    cy.wait("@savePlace").its("request.body").should("deep.equal", {
      name: "St. Mary's Hospital",
      kind: "hospital",
      note: "Has a 24-hour emergency ward",
      longitude: 7.0134,
      latitude: 4.7774,
    });
    cy.contains("Saved “St. Mary's Hospital”").should("be.visible");
    cy.dataCy("place-dialog").should("not.exist");
    cy.get(".admin-unit-popup").should("not.exist");
    cy.wait("@infrastructureLayer");
  });

  it("asks for a name and a kind before saving, and shows the server's reason when it refuses", () => {
    cy.login("administrator");
    cy.interceptApi("POST", "/infrastructure", {
      statusCode: 400,
      message: "Validation failed",
      errors: [{ field: "longitude", message: "That spot is outside every mapped area, so it can't be saved." }],
    }).as("savePlace");
    cy.visit(SPOT);
    cy.wait("@locate");

    cy.dataCy("save-place-here").click();
    cy.dataCy("save-place").click();
    cy.dataCy("place-dialog").should("contain", "Give the place a name").and("contain", "Choose what kind of place this is");
    cy.get("@savePlace.all").should("have.length", 0);

    cy.dataCy("place-name").type("Rumuola clinic");
    cy.dataCy("place-kind").select("clinic");
    cy.dataCy("save-place").click();
    cy.wait("@savePlace");
    cy.dataCy("form-error").should("contain", "outside every mapped area");
    cy.dataCy("place-dialog").should("be.visible");
  });

  it("does not offer anyone else to save a place", () => {
    cy.login("general_public");
    cy.visit(SPOT);
    cy.wait("@locate");

    cy.get(".admin-unit-popup").should("contain", "Port Harcourt");
    cy.dataCy("save-place-here").should("not.exist");
  });
});

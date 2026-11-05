import { PORT_HARCOURT, STATE, WARD, stubGeography, type StubUnit } from "../../support/geo-factories";

// The top bar's search: a place chosen from it is shown on the map, zoomed to.

const ref = ({ id, countryCode, level, levelName, unitName, unitCode }: StubUnit) => ({ id, countryCode, level, levelName, unitName, unitCode });
const areaHit = (unit: StubUnit, parentName: string | null) => ({ ...ref(unit), parentId: unit.parentId, parentName, bbox: unit.bbox });

// Inside Port Harcourt's box, so the LGA the map finds for it is Port Harcourt.
const COMMUNITY = { id: "c1", name: "Rumuokoro", isPrimary: true, point: [6.605, 5.325] };

// A hospital from the import and a place an administrator saved, both inside Port Harcourt's box.
const HOSPITAL = { id: "f1", name: "General Hospital", facilityType: "health", osmClass: "hospital", origin: "import", point: [6.612, 5.318] };
const SAVED_CLINIC = { id: "f2", name: "Hope Clinic", facilityType: "health", osmClass: "clinic", origin: "manual", point: [6.598, 5.331] };

const locateReply = { point: COMMUNITY.point, units: [ref(STATE), ref(PORT_HARCOURT), ref(WARD)] };

/** The map's own address, once it has settled on a view. */
function viewInAddress(search: string) {
  const params = new URLSearchParams(search);
  return { lng: Number(params.get("lng")), lat: Number(params.get("lat")), zoom: Number(params.get("z")) };
}

describe("Search takes you to a place on the map", { defaultCommandTimeout: 10000 }, () => {
  beforeEach(() => {
    cy.login("general_public");
    stubGeography();
    cy.interceptApi("GET", "/public/search*", {
      data: { areas: [areaHit(PORT_HARCOURT, "Rivers"), areaHit(WARD, "Port Harcourt")], communities: [COMMUNITY] },
    }).as("search");
    cy.interceptApi("GET", "/infrastructure/search*", { data: [HOSPITAL, SAVED_CLINIC] }).as("facilitySearch");
    cy.interceptApi("GET", "/admin-units/locate*", { data: locateReply }).as("locate");
  });

  const search = (text: string) => {
    cy.dataCy("quick-search").click();
    cy.dataCy("quick-search-input").type(text);
    cy.wait(["@search", "@facilitySearch"]);
  };

  it("lists matching LGAs and wards as places, with communities and facilities beside them", () => {
    cy.visit("/map?lng=7.0&lat=4.85&z=8");
    search("harc");
    cy.dataCy("quick-search-option").should("have.length", 5);
    cy.get(".quick-search__group").should("contain", "Places").and("contain", "Communities").and("contain", "Facilities");
    cy.dataCy("quick-search-option").first().should("contain", "Port Harcourt").and("contain", "LGA · Rivers");
    cy.dataCy("quick-search-option").eq(1).should("contain", "Phward 17").and("contain", "Ward · Port Harcourt");
    cy.dataCy("quick-search-option").eq(2).should("contain", "Rumuokoro").and("contain", "Community");
    cy.dataCy("quick-search-option").eq(3).should("contain", "General Hospital").and("contain", "Hospital");
    cy.dataCy("quick-search-option").eq(4).should("contain", "Hope Clinic").and("contain", "Clinic · Saved place");
  });

  it("zooms the open map to the LGA chosen, and highlights it", () => {
    cy.visit("/map?lng=7.0&lat=4.85&z=8");
    cy.wait("@lgaLayer");
    search("harc");
    cy.dataCy("quick-search-option").first().click();

    cy.dataCy("selected-lga").should("contain", "Port Harcourt");
    cy.location("pathname").should("eq", "/map");
    // The map has moved over the LGA's box (6.58 to 6.63, 5.30 to 5.35), well in from where it began.
    cy.location("search").should((search) => {
      const { lng, lat, zoom } = viewInAddress(search);
      expect(lng).to.be.closeTo(6.605, 0.05);
      expect(lat).to.be.closeTo(5.325, 0.05);
      expect(zoom).to.be.greaterThan(10);
    });
  });

  it("shows the ward's LGA when a ward is chosen", () => {
    cy.visit("/map?lng=7.0&lat=4.85&z=8");
    search("phward");
    cy.dataCy("quick-search-option").eq(1).click();
    cy.dataCy("selected-lga").should("contain", "Port Harcourt");
    cy.location("search").should("contain", `lga=${PORT_HARCOURT.id}`);
  });

  it("zooms the open map to a community, pins it and says which LGA and ward it is in", () => {
    cy.visit("/map?lng=7.0&lat=4.85&z=8");
    search("rumu");
    cy.dataCy("quick-search-option").eq(2).click();

    cy.wait("@locate").its("request.query").should("deep.equal", { lon: "6.605", lat: "5.325" });
    cy.get(".admin-unit-popup").should("contain", "Rumuokoro").and("contain", "Port Harcourt");
    cy.dataCy("location-trace").should("contain", "Rumuokoro");
    cy.dataCy("selected-lga").should("contain", "Port Harcourt");
    cy.location("search").should("contain", "pin=6.605%2C5.325").and("contain", "pinLabel=Rumuokoro");
    cy.location("search").should((search) => {
      const { lng, lat, zoom } = viewInAddress(search);
      expect(lng).to.be.closeTo(6.605, 0.02);
      expect(lat).to.be.closeTo(5.325, 0.02);
      expect(zoom).to.be.greaterThan(12);
    });
    // The lookup is made once, not again for the same spot.
    cy.get("@locate.all").should("have.length", 1);
  });

  it("zooms the open map close in on a facility, pins it and says which LGA and ward it is in", () => {
    cy.visit("/map?lng=7.0&lat=4.85&z=8");
    search("hosp");
    cy.dataCy("quick-search-option").eq(3).click();

    cy.wait("@locate").its("request.query").should("deep.equal", { lon: "6.612", lat: "5.318" });
    cy.get(".admin-unit-popup").should("contain", "General Hospital").and("contain", "Port Harcourt");
    cy.dataCy("location-trace").should("contain", "General Hospital");
    cy.location("search").should("contain", "pinLabel=General+Hospital");
    cy.location("search").should((search) => {
      const { lng, lat, zoom } = viewInAddress(search);
      expect(lng).to.be.closeTo(6.612, 0.01);
      expect(lat).to.be.closeTo(5.318, 0.01);
      expect(zoom).to.be.greaterThan(14);
    });
    cy.get("@locate.all").should("have.length", 1);
  });

  it("opens the map on a facility when searched from another page", () => {
    cy.visit("/help");
    search("clinic");
    cy.dataCy("quick-search-option").eq(4).click();
    cy.location("pathname").should("eq", "/map");
    cy.wait("@locate");
    cy.get(".admin-unit-popup").should("contain", "Hope Clinic");
    cy.get("@locate.all").should("have.length", 1);
  });

  it("opens the map on the place when searched from another page", () => {
    cy.visit("/help");
    search("rumu");
    cy.dataCy("quick-search-option").eq(2).click();

    cy.location("pathname").should("eq", "/map");
    cy.wait("@locate");
    cy.get(".admin-unit-popup").should("contain", "Rumuokoro");
    cy.dataCy("location-trace").should("contain", "Rumuokoro");
    cy.get("@locate.all").should("have.length", 1);
  });

  it("opens the map on the LGA when searched from another page", () => {
    cy.visit("/help");
    search("harc");
    cy.dataCy("quick-search-option").first().click();
    cy.location("pathname").should("eq", "/map");
    cy.dataCy("selected-lga").should("contain", "Port Harcourt");
  });

  it("keeps the layers switched on when a place is chosen on the map", () => {
    cy.visit("/map?lng=7.0&lat=4.85&z=8&layers=state%2Clga");
    search("harc");
    cy.dataCy("quick-search-option").first().click();
    cy.dataCy("selected-lga").should("contain", "Port Harcourt");
    cy.location("search").should("contain", "layers=state%2Clga");
  });

  it("says so when no place matches", () => {
    cy.interceptApi("GET", "/public/search*", { data: { areas: [], communities: [] } }).as("empty");
    cy.interceptApi("GET", "/infrastructure/search*", { data: [] }).as("emptyFacilities");
    cy.visit("/map");
    cy.dataCy("quick-search").click();
    cy.dataCy("quick-search-input").type("zzzz");
    cy.wait(["@empty", "@emptyFacilities"]);
    cy.get(".quick-search__status").should("contain", 'Nothing matches "zzzz"');
  });

  it("still lists what it found when only some places can't be searched", () => {
    cy.interceptApi("GET", "/public/search*", { statusCode: 500, message: "Something went wrong" }).as("failed");
    cy.visit("/map");
    cy.dataCy("quick-search").click();
    cy.dataCy("quick-search-input").type("hosp");
    cy.wait(["@failed", "@facilitySearch"]);
    cy.dataCy("quick-search-option").should("have.length", 2);
    cy.get(".quick-search__status").should("contain", "2 results, but some places couldn't be searched.");
  });

  it("says so when no place can be searched", () => {
    cy.interceptApi("GET", "/public/search*", { statusCode: 500, message: "Something went wrong" }).as("failed");
    cy.interceptApi("GET", "/infrastructure/search*", { statusCode: 500, message: "Something went wrong" }).as("facilitiesFailed");
    cy.visit("/map");
    cy.dataCy("quick-search").click();
    cy.dataCy("quick-search-input").type("harc");
    cy.wait(["@failed", "@facilitiesFailed"]);
    cy.get(".quick-search__status").should("contain", "Places couldn't be searched");
  });
});

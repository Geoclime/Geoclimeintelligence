import { PORT_HARCOURT, STATE, featureCollection } from "../../support/geo-factories";

// Alerts and community flood reports, signed in.

const alert = {
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
};

const report = {
  id: "report-1",
  point: [7.0134, 4.7774],
  locationName: "Aba Road by Garrison",
  lga: { id: PORT_HARCOURT.id, unitName: "Port Harcourt" },
  ward: null,
  waterDepth: "knee",
  description: "Road under water, cars turning back.",
  status: "pending",
  reviewNote: null,
  reviewedAt: null,
  createdAt: "2026-10-30T08:00:00.000Z",
  media: [],
  reporter: { name: "Ada Obi", organisation: null },
  mine: false,
};

function stubMaps() {
  cy.interceptApi("GET", "/public/outline", { data: { bbox: STATE.bbox, areas: featureCollection([PORT_HARCOURT]) } });
  cy.interceptApi("GET", "/public/alert-map", { data: { alerts: [alert], reports: [], reportDays: 7, generatedAt: "2026-10-30T09:00:00.000Z" } });
}

describe("Flood alerts", () => {
  it("shows alerts in force to everyone, without the issuing controls", () => {
    cy.login("general_public");
    stubMaps();
    cy.interceptApi("GET", "/alerts*", { data: [alert] }).as("getAlerts");
    cy.visit("/alerts");
    cy.wait("@getAlerts");
    cy.dataCy("alert-card").should("contain", "River Bonny rising").and("contain", "In force");
    cy.dataCy("open-issue-alert").should("not.exist");
    cy.dataCy("end-alert").should("not.exist");
  });

  it("lets an official issue an alert with the level's suggested actions", () => {
    cy.login("government_official");
    stubMaps();
    cy.interceptApi("GET", "/alerts*", { data: [] });
    cy.interceptApi("GET", "/admin-units*", { data: [PORT_HARCOURT], meta: { page: 1, pageSize: 50, total: 1 } });
    cy.interceptApi("POST", "/alerts", { statusCode: 201, data: { ...alert, severity: "severe" } }).as("issue");
    cy.visit("/alerts");
    cy.dataCy("open-issue-alert").click();
    cy.dataCy("severity-severe").click();
    cy.dataCy("alert-actions").should("contain.value", "Evacuate now");
    cy.dataCy("area-picker").contains("label", "Port Harcourt").click();
    cy.dataCy("alert-title").type("River Bonny overflowing");
    cy.dataCy("alert-message").type("The river has burst its banks at Borokiri.");
    cy.dataCy("issue-alert").click();
    cy.wait("@issue").its("request.body").should((body) => {
      expect(body).to.include({ severity: "severe", title: "River Bonny overflowing" });
      expect(body.areaIds).to.deep.equal([PORT_HARCOURT.id]);
      expect(body.actions[0]).to.contain("Evacuate now");
    });
    cy.dataCy("toast-success").should("contain", "issued");
  });
});

describe("Flood reports", () => {
  it("asks for the depth and a description before sending", () => {
    cy.login("general_public");
    cy.interceptApi("GET", "/flood-reports/mine*", { data: [], meta: { page: 1, pageSize: 10, total: 0 } });
    cy.interceptApi("GET", "/flood-reports/options", {
      data: {
        cloudStorage: true,
        limits: {
          photo: { maxCount: 3, maxBytes: 8388608, maxSeconds: null, enabled: true },
          audio: { maxCount: 1, maxBytes: 10485760, maxSeconds: 60, enabled: true },
          video: { maxCount: 1, maxBytes: 52428800, maxSeconds: 60, enabled: true },
          file: { maxCount: 2, maxBytes: 10485760, maxSeconds: null, enabled: true },
        },
      },
    });
    cy.visit("/report", { onBeforeLoad: (win) => cy.stub(win.navigator.geolocation, "getCurrentPosition").callsFake(() => undefined) });
    cy.dataCy("video-picker").should("contain", "Add a video");
    cy.dataCy("document-picker").should("contain", "Attach a PDF");
    cy.dataCy("report-submit").click();
    cy.dataCy("field-error").should("contain", "Choose how deep the water is").and("contain", "Describe what you see");
  });

  it("lets a reviewer publish a pending report", () => {
    cy.login("emergency_responder");
    cy.interceptApi("GET", "/flood-reports?*", { data: [report], meta: { page: 1, pageSize: 20, total: 1 } }).as("queue");
    cy.interceptApi("POST", `/flood-reports/${report.id}/review`, { data: { ...report, status: "published", reviewedAt: "2026-10-30T09:00:00.000Z" } }).as("review");
    cy.visit("/reports/review");
    cy.wait("@queue").its("request.query").should("include", { status: "pending" });
    cy.dataCy("report-card").should("contain", "Knee-deep").and("contain", "Ada Obi");
    cy.dataCy("publish-report").click();
    cy.wait("@review").its("request.body").should("deep.equal", { decision: "publish" });
    cy.dataCy("report-card").should("contain", "Published");
  });

  it("keeps the review queue from members of the public", () => {
    cy.login("general_public");
    cy.visit("/reports/review");
    cy.dataCy("forbidden").should("be.visible");
  });
});

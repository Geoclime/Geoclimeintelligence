import { OBIO_AKPOR, PORT_HARCOURT, STATE, featureCollection } from "../../support/geo-factories";

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
  cy.interceptApi("GET", "/public/alert-map", { data: { alerts: [alert], reports: [], reportDays: 7, floods: [], floodDays: 3, generatedAt: "2026-10-30T09:00:00.000Z" } });
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

describe("Choosing the areas an alert covers", () => {
  const stateWithLgaCount = { ...STATE, childCount: 23 };
  const okrika = { ...OBIO_AKPOR, id: "10000000-0000-4000-8000-0000000000a1", unitName: "Okrika", parentId: STATE.id };

  function stubAreas() {
    cy.login("government_official");
    stubMaps();
    cy.interceptApi("GET", "/alerts*", { data: [] });
    cy.interceptApi("GET", "/admin-units?*", { data: [stateWithLgaCount], meta: { page: 1, pageSize: 100, total: 1 } }, { query: { level: "1" } });
    cy.interceptApi("GET", "/admin-units?*", { data: [PORT_HARCOURT, okrika], meta: { page: 1, pageSize: 50, total: 2 } }, { query: { level: "2" } });
    cy.visit("/alerts");
    cy.dataCy("open-issue-alert").click();
  }

  it("says how many LGAs the chosen areas add up to", () => {
    stubAreas();
    cy.dataCy("area-picker-summary").should("not.exist");
    cy.dataCy("area-picker").contains("label", "Port Harcourt").click();
    cy.dataCy("area-picker").contains("label", "Okrika").click();
    cy.dataCy("area-picker-summary").should("contain", "Covers 2 LGAs.");
    cy.dataCy("area-picker-state-warning").should("not.exist");
  });

  it("makes a whole state unmistakable, and shows its LGAs as covered instead of separate choices", () => {
    stubAreas();
    cy.dataCy("area-picker").contains("label", "Port Harcourt").click();
    cy.dataCy("area-picker").contains("label", "Rivers State").click();

    cy.dataCy("area-picker-summary").should("contain", "Covers all 23 LGAs in Rivers State.");
    cy.dataCy("area-picker-state-warning").should("contain", "everyone living there is notified");
    // The LGA chosen earlier is now part of the state, so it is no longer listed on its own.
    cy.get("[aria-label='Chosen areas']").should("contain", "Rivers State · whole state").and("not.contain", "Port Harcourt");
    cy.dataCy("area-picker").contains("label", "Okrika").find("input").should("be.checked").and("be.disabled");

    // Unticking the state gives the LGAs back.
    cy.dataCy("area-picker").contains("label", "Rivers State").click();
    cy.dataCy("area-picker-state-warning").should("not.exist");
    cy.dataCy("area-picker").contains("label", "Okrika").find("input").should("not.be.checked").and("not.be.disabled");
  });
});

describe("How long an alert lasts", () => {
  it("takes any number of days: a custom length is sent as the alert's end time", () => {
    cy.login("government_official");
    stubMaps();
    cy.interceptApi("GET", "/alerts*", { data: [] });
    cy.interceptApi("GET", "/admin-units*", { data: [PORT_HARCOURT], meta: { page: 1, pageSize: 50, total: 1 } });
    cy.interceptApi("POST", "/alerts", { statusCode: 201, data: alert }).as("issue");
    cy.visit("/alerts");
    cy.dataCy("open-issue-alert").click();
    cy.dataCy("area-picker").contains("label", "Port Harcourt").click();
    cy.dataCy("alert-title").type("River Bonny flooding");
    cy.dataCy("alert-message").type("The river has burst its banks at Borokiri.");

    cy.dataCy("alert-custom-days").should("not.exist");
    cy.dataCy("alert-duration").select("Custom number of days…");
    cy.dataCy("alert-custom-days").clear().type("45");
    cy.dataCy("issue-alert").click();
    cy.wait("@issue")
      .its("request.body.expiresAt")
      .should((expiresAt: string) => {
        const days = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;
        expect(days).to.be.within(44.9, 45.1);
      });
  });

  it("asks for a whole number of days, up to a year", () => {
    cy.login("government_official");
    stubMaps();
    cy.interceptApi("GET", "/alerts*", { data: [] });
    cy.interceptApi("GET", "/admin-units*", { data: [PORT_HARCOURT], meta: { page: 1, pageSize: 50, total: 1 } });
    cy.visit("/alerts");
    cy.dataCy("open-issue-alert").click();
    cy.dataCy("area-picker").contains("label", "Port Harcourt").click();
    cy.dataCy("alert-title").type("River Bonny flooding");
    cy.dataCy("alert-message").type("The river has burst its banks at Borokiri.");
    cy.dataCy("alert-duration").select("Custom number of days…");
    cy.dataCy("alert-custom-days").clear().type("400");
    cy.dataCy("issue-alert").click();
    cy.dataCy("field-error").should("contain", "whole number of days, from 1 to 365");
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

  it("shows where a report was sent from, before it is published", () => {
    cy.login("emergency_responder");
    cy.interceptApi("GET", "/flood-reports?*", { data: [report], meta: { page: 1, pageSize: 20, total: 1 } });
    // The map draws the same layers as the main map: boundaries and the feature layers.
    cy.interceptApi("GET", "/admin-units/geojson*", { data: { type: "FeatureCollection", features: [] } });
    for (const layer of ["roads", "waterways", "settlements", "infrastructure", "buildings"]) {
      cy.interceptApi("GET", `/${layer}/geojson*`, { data: { type: "FeatureCollection", features: [] } });
    }
    cy.visit("/reports/review");

    cy.dataCy("report-map").should("not.exist");
    cy.dataCy("report-view-map").should("contain", "View on map").click();
    cy.dataCy("report-view-map").should("contain", "Hide map").and("have.attr", "aria-expanded", "true");

    // The links work whether or not this browser can draw the map itself.
    cy.dataCy("report-map").should("be.visible");
    // The full map is told which spot to mark, so it isn't just centred on it.
    cy.dataCy("report-map-full").should("have.attr", "href", "/map?lng=7.0134&lat=4.7774&z=17.0&pin=7.01340%2C4.77740&pinLabel=Flood+report").and("have.attr", "target", "_blank");
    cy.dataCy("report-map-google").should("have.attr", "href", "https://www.google.com/maps/search/?api=1&query=4.7774,7.0134");
    cy.dataCy("report-map-layers").should("contain", "Boundaries").and("contain", "Waterways").and("contain", "Roads").and("contain", "Buildings");
    cy.dataCy("report-map-layers").contains("label", "Buildings").find("input").should("be.checked");
    cy.dataCy("report-map-satellite").click().should("have.attr", "aria-pressed", "true");
    cy.dataCy("report-map-streets").should("have.attr", "aria-pressed", "false");
    // The photograph already shows the buildings, so their shapes are put away; they can be put back.
    cy.dataCy("report-map-layers").contains("label", "Buildings").find("input").should("not.be.checked").check();
    cy.dataCy("report-map-layers").contains("label", "Roads").find("input").uncheck().should("not.be.checked");

    cy.dataCy("report-view-map").click();
    cy.dataCy("report-map").should("not.exist");
  });

  it("keeps the review queue from members of the public", () => {
    cy.login("general_public");
    cy.visit("/reports/review");
    cy.dataCy("forbidden").should("be.visible");
  });
});

describe("Editing and deleting an alert", () => {
  function openAlerts(alerts: object[] = [alert]) {
    cy.login("government_official");
    stubMaps();
    cy.interceptApi("GET", "/alerts*", { data: alerts });
    cy.interceptApi("GET", "/admin-units?*", { data: [STATE], meta: { page: 1, pageSize: 100, total: 1 } }, { query: { level: "1" } });
    cy.interceptApi("GET", "/admin-units?*", { data: [PORT_HARCOURT], meta: { page: 1, pageSize: 50, total: 1 } }, { query: { level: "2" } });
    cy.visit("/alerts");
  }

  it("offers Edit and End only while an alert is in force, and Delete always", () => {
    openAlerts([alert, { ...alert, id: "alert-2", title: "Old warning", status: "expired" }]);
    cy.dataCy("alert-card").first().within(() => {
      cy.dataCy("edit-alert").should("exist");
      cy.dataCy("end-alert").should("exist");
      cy.dataCy("delete-alert").should("exist");
    });
    cy.contains("summary", "Ended in the last 30 days").click();
    cy.contains("[data-cy=alert-card]", "Old warning").within(() => {
      cy.dataCy("edit-alert").should("not.exist");
      cy.dataCy("delete-alert").should("exist");
    });
  });

  it("edits an alert from what was issued, and keeps its end time unless a new one is chosen", () => {
    openAlerts();
    cy.interceptApi("PATCH", `/alerts/${alert.id}`, { data: { ...alert, severity: "severe", title: "River Bonny overflowing" } }).as("save");
    cy.dataCy("edit-alert").click();

    cy.dataCy("alert-title").should("have.value", alert.title);
    cy.dataCy("severity-warning").find("input").should("be.checked");
    cy.dataCy("alert-duration").should("have.value", "keep");
    cy.dataCy("alert-actions").should("contain.value", "Move valuables to higher ground.");

    // Changing the level must not overwrite the actions that were written.
    cy.dataCy("severity-severe").click();
    cy.dataCy("alert-actions").should("contain.value", "Move valuables to higher ground.").and("not.contain.value", "Evacuate now");

    cy.dataCy("alert-title").clear().type("River Bonny overflowing");
    cy.dataCy("save-alert").click();
    cy.wait("@save").its("request.body").should((body) => {
      expect(body).to.include({ severity: "severe", title: "River Bonny overflowing", notify: false });
      expect(body).not.to.have.property("expiresAt");
    });
    cy.dataCy("toast-success").should("contain", "Alert updated");
  });

  it("tells the people the alert covers only when asked", () => {
    openAlerts();
    cy.interceptApi("PATCH", `/alerts/${alert.id}`, { data: alert }).as("save");
    cy.dataCy("edit-alert").click();
    cy.dataCy("alert-notify").find("input").check();
    cy.dataCy("alert-duration").select("24 hours from now");
    cy.dataCy("save-alert").click();
    cy.wait("@save").its("request.body").should((body) => {
      expect(body.notify).to.equal(true);
      expect(new Date(body.expiresAt).getTime() - Date.now()).to.be.within(23.9 * 3_600_000, 24.1 * 3_600_000);
    });
    cy.dataCy("toast-success").should("contain", "were notified");
  });

  it("deletes an alert after asking", () => {
    openAlerts();
    cy.interceptApi("DELETE", `/alerts/${alert.id}`, { data: null }).as("remove");
    cy.dataCy("delete-alert").click();
    cy.dataCy("delete-alert-dialog").should("contain", "removed for good");
    cy.dataCy("confirm-delete-alert").click();
    cy.wait("@remove");
    cy.dataCy("toast-info").should("contain", "was deleted");
  });
});

describe("Editing and deleting a flood report", () => {
  const mineList = [
    { ...report, id: "report-pending", mine: true, status: "pending", locationName: "Aba Road by Garrison" },
    { ...report, id: "report-rejected", mine: true, status: "rejected", reviewNote: "Please name the street", reviewedAt: "2026-10-30T09:00:00.000Z", locationName: "Near the market" },
    { ...report, id: "report-published", mine: true, status: "published", reviewedAt: "2026-10-30T09:00:00.000Z", locationName: "Old Aba Road" },
  ];

  function openReport() {
    cy.login("general_public");
    cy.interceptApi("GET", "/flood-reports/mine*", { data: mineList, meta: { page: 1, pageSize: 10, total: 3 } });
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
  }

  const card = (place: string) => cy.contains("[data-cy=my-reports] [data-cy=report-card]", place);

  it("offers Edit and Delete until a report is published", () => {
    openReport();
    card("Aba Road by Garrison").within(() => {
      cy.dataCy("edit-report").should("exist");
      cy.dataCy("delete-report").should("exist");
    });
    card("Old Aba Road").within(() => {
      cy.dataCy("edit-report").should("not.exist");
      cy.dataCy("delete-report").should("not.exist");
    });
  });

  it("edits a pending report: the text and position are sent, the files are not touched", () => {
    openReport();
    cy.interceptApi("PATCH", "/flood-reports/report-pending", { data: { ...mineList[0], waterDepth: "chest" } }).as("save");
    card("Aba Road by Garrison").find("[data-cy=edit-report]").click();
    cy.dataCy("edit-report-dialog").within(() => {
      cy.dataCy("report-location-name").should("have.value", "Aba Road by Garrison");
      cy.dataCy("report-depth").select("chest");
      cy.dataCy("report-description").clear().type("Water is now up to the chest and still rising.");
      cy.dataCy("save-report").should("contain", "Save changes").click();
    });
    cy.wait("@save").its("request.body").should((body) => {
      expect(body).to.include({ waterDepth: "chest", description: "Water is now up to the chest and still rising." });
      expect(body.lon).to.equal(report.point[0]);
      expect(body.lat).to.equal(report.point[1]);
    });
    cy.dataCy("toast-success").should("contain", "Your report was updated");
  });

  it("sends a rejected report back for review, and shows why it was rejected", () => {
    openReport();
    cy.interceptApi("PATCH", "/flood-reports/report-rejected", { data: { ...mineList[1], status: "pending", reviewNote: null } }).as("save");
    card("Near the market").find("[data-cy=edit-report]").click();
    cy.dataCy("edit-report-rejected").should("contain", "Please name the street");
    cy.dataCy("save-report").should("contain", "send for review again").click();
    cy.wait("@save");
    cy.dataCy("toast-success").should("contain", "back with the coordinators");
  });

  it("deletes a report after asking", () => {
    openReport();
    cy.interceptApi("DELETE", "/flood-reports/report-pending", { data: null }).as("remove");
    card("Aba Road by Garrison").find("[data-cy=delete-report]").click();
    cy.dataCy("delete-report-dialog").should("contain", "removed for good");
    cy.dataCy("confirm-delete-report").click();
    cy.wait("@remove");
    cy.dataCy("toast-info").should("contain", "was deleted");
  });

  it("lets a coordinator delete a published report from the review queue, and says the sender is told", () => {
    cy.login("emergency_responder");
    cy.interceptApi("GET", "/flood-reports?*", { data: [{ ...report, status: "published", reviewedAt: "2026-10-30T09:00:00.000Z" }], meta: { page: 1, pageSize: 20, total: 1 } });
    cy.interceptApi("DELETE", `/flood-reports/${report.id}`, { data: null }).as("remove");
    cy.visit("/reports/review?status=published");
    cy.dataCy("delete-report").click();
    cy.dataCy("delete-report-dialog").should("contain", "from the public alert map").and("contain", "will be told");
    cy.dataCy("confirm-delete-report").click();
    cy.wait("@remove");
  });
});

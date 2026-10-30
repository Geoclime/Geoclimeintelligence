import { buildUser } from "../../support/factories";
import { PORT_HARCOURT, STATE } from "../../support/geo-factories";

// "Finish setting up": a signed-in person with a missing detail sees it before anything else.

describe("Finish setting up", () => {
  const incomplete = { displayName: "Ada Obi", phone: null, homeAdminUnitId: null, profileComplete: false };

  beforeEach(() => {
    cy.interceptApi("GET", "/admin-units?*", { data: [STATE], meta: { page: 1, pageSize: 100, total: 1 } });
    cy.interceptApi("GET", `/admin-units/${STATE.id}/children*`, { data: [PORT_HARCOURT], meta: { page: 1, pageSize: 100, total: 1 } });
  });

  it("sends an unfinished profile here first, whatever page was asked for", () => {
    cy.login("general_public", { user: incomplete });
    cy.visit("/alerts");
    cy.location("pathname").should("eq", "/welcome");
    cy.dataCy("welcome-name").should("have.value", "Ada Obi");
  });

  it("asks for the phone number and LGA, saves them, then goes where the person was heading", () => {
    cy.login("general_public", { user: incomplete });
    const complete = buildUser({ n: 9000, displayName: "Ada Obi", phone: "+234 803 123 4567", homeAdminUnitId: PORT_HARCOURT.id, profileComplete: true });
    cy.interceptApi("PATCH", "/auth/me", { data: complete }).as("save");
    cy.visit("/report");

    cy.dataCy("welcome-save").click();
    cy.dataCy("field-error").should("contain", "phone number").and("contain", "LGA");

    cy.dataCy("welcome-phone").type("+234 803 123 4567");
    cy.dataCy("home-state").find("select").should("have.value", STATE.id);
    cy.dataCy("home-lga").find("select").select(PORT_HARCOURT.id);
    cy.dataCy("welcome-save").click();
    cy.wait("@save").its("request.body").should("deep.include", { phone: "+234 803 123 4567", homeAdminUnitId: PORT_HARCOURT.id });

    cy.dataCy("welcome-notifications").should("contain", "Stay informed");
    cy.dataCy("welcome-finish").click();
    cy.location("pathname").should("eq", "/report");
  });

  it("lets a complete profile straight through", () => {
    cy.login("general_public", { user: { phone: "+234 803 123 4567", homeAdminUnitId: PORT_HARCOURT.id, profileComplete: true } });
    cy.interceptApi("GET", "/notifications*", { data: { items: [], unreadCount: 0 }, meta: { page: 1, pageSize: 10, total: 0 } });
    cy.visit("/welcome");
    cy.location("pathname").should("eq", "/map");
  });
});

describe("Notifications", () => {
  const items = [
    { id: "n1", category: "flood_alerts", title: "Flood warning: River Bonny rising", body: "Port Harcourt LGA.", link: "/alerts", readAt: null, createdAt: "2026-10-30T08:10:00.000Z" },
    { id: "n2", category: "account", title: "Your access was updated", body: "You now have Researcher access.", link: "/account", readAt: "2026-10-29T10:00:00.000Z", createdAt: "2026-10-29T09:00:00.000Z" },
  ];

  it("shows the unread count on the bell, and marks everything read", () => {
    cy.login("general_public");
    cy.interceptApi("GET", "/notifications?*", { data: { items, unreadCount: 1 }, meta: { page: 1, pageSize: 10, total: 2 } });
    cy.interceptApi("POST", "/notifications/read-all", { data: { unreadCount: 0 } }).as("readAll");
    cy.visit("/places");
    cy.dataCy("notification-bell").should("have.attr", "aria-label", "Notifications, 1 unread").click();
    cy.dataCy("notification-panel").should("contain", "River Bonny rising");
    cy.dataCy("mark-all-read").click();
    cy.wait("@readAll");
    cy.dataCy("notification-bell").should("have.attr", "aria-label", "Notifications");
  });

  it("saves a channel switch for one kind of notification", () => {
    cy.login("general_public");
    cy.interceptApi("GET", "/notifications?*", { data: { items, unreadCount: 1 }, meta: { page: 1, pageSize: 20, total: 2 } });
    const preferences = {
      categories: [
        { category: "flood_alerts", label: "Flood alerts", inApp: true, email: true, push: true },
        { category: "my_reports", label: "Your flood reports", inApp: true, email: true, push: true },
        { category: "account", label: "Account and access", inApp: true, email: true, push: true },
      ],
      channels: { inApp: true, email: true, push: false },
    };
    cy.interceptApi("GET", "/notifications/preferences", { data: preferences });
    cy.interceptApi("PUT", "/notifications/preferences", { data: preferences }).as("save");
    cy.visit("/notifications");
    cy.dataCy("pref-flood_alerts-push").should("be.disabled");
    cy.dataCy("pref-my_reports-email").uncheck({ force: true });
    cy.wait("@save").its("request.body").should("deep.equal", { category: "my_reports", inApp: true, email: false, push: true });
  });
});

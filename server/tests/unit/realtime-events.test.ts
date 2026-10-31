import { afterEach, describe, expect, it } from "vitest";
import { domainEvents } from "../../src/common/events/domain-events";
import { registerRealtimeListeners } from "../../src/common/realtime/realtime-events";
import { ADMINISTRATORS_ROOM, REVIEWERS_ROOM } from "../../src/common/realtime/realtime-gateway";

// What each thing that happens tells the browsers that show it. Each signal is a small "this
// changed", and the public alert map's server-side copy is dropped before the signal goes out.

function setup(reporter: string | null = "reporter-1") {
  const sent: string[] = [];
  registerRealtimeListeners({
    realtime: {
      emitToAll: (event) => void sent.push(`everyone:${event}`),
      emitToRoom: (room, event) => void sent.push(`${room}:${event}`),
      emitToUser: (userId, event) => void sent.push(`user ${userId}:${event}`),
    },
    publicData: { invalidateAlertMap: () => void sent.push("drop the cached alert map") },
    reporterOf: async () => reporter,
  });
  return sent;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => domainEvents.clear());

describe("realtime signals", () => {
  it("tells everyone the alert map changed when an alert is issued, edited, ended or deleted, dropping the server's copy first", async () => {
    const sent = setup();
    domainEvents.emit("alert.issued", { alertId: "a1", issuerId: "u1" });
    domainEvents.emit("alert.updated", { alertId: "a1", editorId: "u1", notify: false });
    domainEvents.emit("alert.ended", { alertId: "a1" });
    domainEvents.emit("alert.deleted", { alertId: "a1" });
    await settle();
    expect(sent).toEqual(Array(4).fill(["drop the cached alert map", "everyone:alerts:changed"]).flat());
  });

  it("tells everyone the public map changed when a flood is recorded, receded or deleted, dropping the server's copy first", async () => {
    const sent = setup();
    domainEvents.emit("flood.recorded", { floodId: "f1" });
    domainEvents.emit("flood.receded", { floodId: "f1" });
    domainEvents.emit("flood.deleted", { floodId: "f1" });
    await settle();
    expect(sent).toEqual(Array(3).fill(["drop the cached alert map", "everyone:alerts:changed"]).flat());
  });

  it("tells the review queue and the sender about a new or edited report, and nobody else", async () => {
    const sent = setup();
    domainEvents.emit("report.submitted", { reportId: "r1", reporterId: "reporter-1" });
    domainEvents.emit("report.updated", { reportId: "r1", reporterId: "reporter-1" });
    await settle();
    expect(sent).toEqual([`${REVIEWERS_ROOM}:reports:changed`, "user reporter-1:reports:changed", `${REVIEWERS_ROOM}:reports:changed`, "user reporter-1:reports:changed"]);
    expect(sent.some((signal) => signal.startsWith("everyone"))).toBe(false);
  });

  it("refreshes the public map too when a report is reviewed or deleted: published reports are on it", async () => {
    const sent = setup();
    domainEvents.emit("report.reviewed", { reportId: "r1", reviewerId: "u2" });
    await settle();
    expect(sent).toEqual(["drop the cached alert map", "everyone:alerts:changed", `${REVIEWERS_ROOM}:reports:changed`, "user reporter-1:reports:changed"]);

    sent.length = 0;
    domainEvents.emit("report.deleted", { reportId: "r1", reporterId: "reporter-1", locationName: "Aba Road", byReviewer: true });
    await settle();
    expect(sent).toEqual(["drop the cached alert map", "everyone:alerts:changed", `${REVIEWERS_ROOM}:reports:changed`, "user reporter-1:reports:changed"]);
  });

  it("copes with a report whose sender is gone", async () => {
    const sent = setup(null);
    domainEvents.emit("report.reviewed", { reportId: "r1", reviewerId: "u2" });
    await settle();
    expect(sent).toEqual(["drop the cached alert map", "everyone:alerts:changed", `${REVIEWERS_ROOM}:reports:changed`]);
  });

  it("tells administrators about role requests, and the person whose role was answered", async () => {
    const sent = setup();
    domainEvents.emit("role.requested", { userId: "u9" });
    domainEvents.emit("role.answered", { userId: "u9", role: "emergency_responder", approved: true });
    await settle();
    expect(sent).toEqual([`${ADMINISTRATORS_ROOM}:users:changed`, `${ADMINISTRATORS_ROOM}:users:changed`, "user u9:account:changed"]);
  });

  it("never sends anything private to everyone: only the public map's signal goes to the whole room", async () => {
    const sent = setup();
    domainEvents.emit("report.submitted", { reportId: "r1", reporterId: "reporter-1" });
    domainEvents.emit("role.requested", { userId: "u9" });
    domainEvents.emit("role.answered", { userId: "u9", role: "researcher", approved: true });
    await settle();
    expect(sent.filter((signal) => signal.startsWith("everyone"))).toEqual([]);
  });
});

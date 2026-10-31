import { FloodReportRepository } from "../../modules/flood-reports/flood-report.repository";
import { PublicService } from "../../modules/public/public.service";
import { domainEvents } from "../events/domain-events";
import { ADMINISTRATORS_ROOM, RealtimeGateway, REVIEWERS_ROOM } from "./realtime-gateway";

interface RealtimeDeps {
  realtime: Pick<RealtimeGateway, "emitToAll" | "emitToRoom" | "emitToUser">;
  publicData: Pick<PublicService, "invalidateAlertMap">;
  /** Who sent a report, for events that only carry its id. */
  reporterOf: (reportId: string) => Promise<string | null>;
}

const defaults = (): RealtimeDeps => ({
  realtime: RealtimeGateway.Instance,
  publicData: PublicService.Instance,
  reporterOf: async (reportId) => (await FloodReportRepository.Instance.findReport(reportId))?.reporterId ?? null,
});

/**
 * What happened, as live "this changed" signals to the browsers that show it (Socket.IO). Each is
 * a small message with an id, never the data: the browser asks the REST API again, which applies the
 * usual access rules, so a live signal can't leak anything.
 *
 *   alerts:changed   everyone, signed in or not: an alert was issued, edited, ended or deleted, or a
 *                    report on the public map was published or removed, or a flood was recorded,
 *                    receded or deleted (the landing page and the Alerts page refresh themselves)
 *   reports:changed  the review queue (responders, officials, administrators) and the report's sender
 *   users:changed    administrators: a role was requested or answered
 *   account:changed  the person whose role was just answered, so their access updates at once
 *
 * The server's own copy of the public alert map is dropped BEFORE the signal goes out: otherwise the
 * refresh every browser is about to do would read the old answer back. Registered once at startup
 * (server.ts); tests register none, so nothing is sent. Notifications are separate
 * (modules/notifications/notification-events.ts).
 */
export function registerRealtimeListeners(deps: RealtimeDeps = defaults()): void {
  const { realtime, publicData, reporterOf } = deps;

  const publicMapChanged = (id?: string) => {
    publicData.invalidateAlertMap();
    realtime.emitToAll("alerts:changed", { id });
  };
  const reportsChanged = (reportId: string, reporterId: string | null) => {
    realtime.emitToRoom(REVIEWERS_ROOM, "reports:changed", { reportId });
    if (reporterId) realtime.emitToUser(reporterId, "reports:changed", { reportId });
  };

  for (const name of ["alert.issued", "alert.updated", "alert.ended", "alert.deleted"] as const) {
    domainEvents.on(name, ({ alertId }) => publicMapChanged(alertId));
  }

  for (const name of ["flood.recorded", "flood.receded", "flood.deleted"] as const) {
    domainEvents.on(name, ({ floodId }) => publicMapChanged(floodId));
  }

  domainEvents.on("report.submitted", ({ reportId, reporterId }) => reportsChanged(reportId, reporterId));
  domainEvents.on("report.updated", ({ reportId, reporterId }) => reportsChanged(reportId, reporterId));
  domainEvents.on("report.reviewed", async ({ reportId }) => {
    publicMapChanged();
    reportsChanged(reportId, await reporterOf(reportId));
  });
  domainEvents.on("report.deleted", ({ reportId, reporterId }) => {
    publicMapChanged();
    reportsChanged(reportId, reporterId);
  });

  domainEvents.on("role.requested", ({ userId }) => realtime.emitToRoom(ADMINISTRATORS_ROOM, "users:changed", { userId }));
  domainEvents.on("role.answered", ({ userId }) => {
    realtime.emitToRoom(ADMINISTRATORS_ROOM, "users:changed", { userId });
    realtime.emitToUser(userId, "account:changed", {});
  });
}

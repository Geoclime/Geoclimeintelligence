import type { UserRole } from "../../common/access/roles";
import { domainEvents } from "../../common/events/domain-events";
import { RealtimeGateway } from "../../common/realtime/realtime-gateway";
import { AlertRepository } from "../alerts/alert.repository";
import type { AlertSeverity } from "../alerts/alert.types";
import { FloodReportRepository } from "../flood-reports/flood-report.repository";
import type { WaterDepth } from "../flood-reports/flood-report.types";
import { UserRepository } from "../users/user.repository";
import { NotificationRepository } from "./notification.repository";
import { NotificationService } from "./notification.service";

const SEVERITY_LABEL: Record<AlertSeverity, string> = { watch: "Flood watch", warning: "Flood warning", severe: "Severe flood warning" };
const DEPTH_LABEL: Record<WaterDepth, string> = { ankle: "Ankle-deep", knee: "Knee-deep", waist: "Waist-deep", chest: "Chest-deep", impassable: "Impassable" };
const ROLE_LABEL: Record<UserRole, string> = {
  general_public: "General Public",
  emergency_responder: "Emergency Responder",
  government_official: "Government Official",
  researcher: "Researcher",
  administrator: "Administrator",
};

/** At most `max` characters, cut at a word with an ellipsis. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

/** "Port Harcourt LGA and Rivers State". */
function placeList(areas: { unitName: string; levelName: string }[]): string {
  const names = areas.map((a) => (a.unitName.toLowerCase().endsWith(a.levelName.toLowerCase()) ? a.unitName : `${a.unitName} ${a.levelName}`));
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * Turns what happens on the platform into notifications: who hears about it, and what it says.
 * Registered once at startup (server.ts). Each listener reads the current record, so a message
 * always reflects what was saved, and runs in the background (domain-events.ts).
 */
export function registerNotificationListeners(): void {
  const notify = NotificationService.Instance;
  const recipients = NotificationRepository.Instance;
  const realtime = RealtimeGateway.Instance;

  domainEvents.on("alert.issued", async ({ alertId, issuerId }) => {
    realtime.emitToAll("alerts:changed", { alertId });
    const alert = await AlertRepository.Instance.findAlert(alertId);
    if (!alert) return;
    await notify.notify({
      userIds: await recipients.findAlertRecipients(alert.lgaIds, issuerId),
      category: "flood_alerts",
      title: `${SEVERITY_LABEL[alert.severity]}: ${alert.title}`,
      body: clip(`${placeList(alert.areas)}. ${alert.message}`, 400),
      link: "/alerts",
      urgent: alert.severity !== "watch",
    });
  });

  domainEvents.on("alert.ended", ({ alertId }) => realtime.emitToAll("alerts:changed", { alertId }));

  domainEvents.on("report.submitted", async ({ reportId, reporterId }) => {
    const report = await FloodReportRepository.Instance.findReport(reportId);
    if (!report) return;
    await notify.notify({
      userIds: await recipients.findReviewers(report.lgaId, report.wardId, reporterId),
      category: "review_queue",
      title: "New flood report to review",
      body: `${DEPTH_LABEL[report.waterDepth]} flooding reported at ${report.locationName}${report.lgaName ? `, ${report.lgaName} LGA` : ""}.`,
      link: "/reports/review",
    });
  });

  domainEvents.on("report.reviewed", async ({ reportId }) => {
    const report = await FloodReportRepository.Instance.findReport(reportId);
    if (!report?.reporterId || report.status === "pending") return;
    const published = report.status === "published";
    await notify.notify({
      userIds: [report.reporterId],
      category: "my_reports",
      title: published ? "Your flood report is published" : "Your flood report wasn't published",
      body: published
        ? `Thank you. Your report of ${DEPTH_LABEL[report.waterDepth].toLowerCase()} flooding at ${report.locationName} is now on the public alert map.`
        : `A coordinator reviewed your report from ${report.locationName}${report.reviewNote ? `: "${clip(report.reviewNote, 300)}"` : "."}`,
      link: "/report",
    });
  });

  domainEvents.on("role.requested", async ({ userId }) => {
    const user = await UserRepository.Instance.findById(userId);
    if (!user?.requestedRole) return;
    await notify.notify({
      userIds: (await recipients.findAdministrators()).filter((id) => id !== userId),
      category: "account",
      title: "New role request",
      body: `${user.displayName ?? user.email ?? "Someone"}${user.organisation ? ` (${user.organisation})` : ""} asks for ${ROLE_LABEL[user.requestedRole]} access.`,
      link: "/admin/users?requests=open",
    });
  });

  domainEvents.on("role.answered", async ({ userId, role, approved }) => {
    const label = ROLE_LABEL[role as UserRole] ?? role;
    await notify.notify({
      userIds: [userId],
      category: "account",
      title: approved ? "Your access was updated" : "Your role request was declined",
      body: approved
        ? `You now have ${label} access. Sign out and back in if a new page doesn't appear straight away.`
        : `An administrator declined your request for ${label} access. You can ask again from your profile.`,
      link: "/account",
    });
  });
}

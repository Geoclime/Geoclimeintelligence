import type { AlertSeverity, FloodAlert } from "../types/alert.types";
import { WATER_DEPTHS, type PublicReportPoint, type WaterDepth } from "../types/flood-report.types";
import type { PublicFloodPoint } from "../types/public.types";
import { highestSeverity, SEVERITY_INFO } from "./alert-severity";
import { largestFloodArea } from "./public-flood";
import { formatArea } from "./survey-geometry";
import { WATER_DEPTH_INFO } from "./water-depth";

/** The colour family of the status line: an alert level, the amber of community reports or recorded floods, or the green all-clear. */
export type StripTone = AlertSeverity | "reports" | "clear";

export interface StripStatus {
  tone: StripTone;
  text: string;
  linkLabel: string;
}

function deepest(reports: PublicReportPoint[]): WaterDepth {
  return reports.reduce<WaterDepth>((top, report) => (WATER_DEPTHS.indexOf(report.waterDepth) > WATER_DEPTHS.indexOf(top) ? report.waterDepth : top), "ankle");
}

const days = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;

/**
 * What the landing page's status line says. Official alerts come first. With none in force, a
 * published community report, or a flood a responder recorded on the ground, still has to show:
 * calling that moment all-clear, beside a report of chest-deep water or a measured flood, would be
 * wrong, so it gets its own amber line, worded so that it can't be taken for an official alert
 * level. Only with none of them is it the green all-clear.
 */
export function stripStatus(
  alerts: FloodAlert[],
  reports: PublicReportPoint[],
  reportDays: number,
  floods: PublicFloodPoint[] = [],
  floodDays = 3,
): StripStatus {
  const top = highestSeverity(alerts.map((alert) => alert.severity));
  if (top) {
    const count = alerts.length;
    return {
      tone: top,
      text: `${count} flood ${count === 1 ? "alert" : "alerts"} in force, the highest a ${SEVERITY_INFO[top].label.toLowerCase()}.`,
      linkLabel: "See the alerts",
    };
  }
  const seen: string[] = [];
  if (reports.length > 0) {
    const count = reports.length;
    seen.push(`${count} community flood ${count === 1 ? "report" : "reports"} in the last ${days(reportDays)}, the deepest ${WATER_DEPTH_INFO[deepest(reports)].label.toLowerCase()}`);
  }
  if (floods.length > 0) {
    const count = floods.length;
    seen.push(`${count} ${count === 1 ? "flood" : "floods"} recorded on the ground in the last ${days(floodDays)}, the largest ${formatArea(largestFloodArea(floods))}`);
  }
  if (seen.length > 0) {
    return { tone: "reports", text: `No official flood alerts in force. ${seen.join("; ")}.`, linkLabel: reports.length > 0 ? "See the reports" : "See the map" };
  }
  return { tone: "clear", text: "No flood alerts in force right now.", linkLabel: "Alert map" };
}

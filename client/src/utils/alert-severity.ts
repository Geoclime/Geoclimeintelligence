import type { AlertSeverity, FloodAlert } from "../types/alert.types";

/**
 * What each alert level means and asks of people. The default actions prefill the "issue alert"
 * form; the issuer can change them for the situation.
 */
export const SEVERITY_INFO: Record<AlertSeverity, { label: string; meaning: string; defaultActions: string[] }> = {
  watch: {
    label: "Flood watch",
    meaning: "Flooding is possible. Be prepared.",
    defaultActions: ["Follow updates from official sources.", "Avoid travel near rivers and drainage channels."],
  },
  warning: {
    label: "Flood warning",
    meaning: "Flooding is expected. Act now to protect yourself and property.",
    defaultActions: [
      "Move valuables, documents and medicines to higher ground.",
      "Do not walk or drive through flood water.",
      "Prepare to evacuate if told to.",
    ],
  },
  severe: {
    label: "Severe flood warning",
    meaning: "Danger to life. Act immediately.",
    defaultActions: ["Evacuate now if you are near a river or in a low-lying area.", "Go to higher ground and stay there.", `Call 112 if anyone is in danger.`],
  },
};

const RANK: Record<AlertSeverity, number> = { watch: 1, warning: 2, severe: 3 };

/** The most severe of several levels; null for none. */
export function highestSeverity(levels: AlertSeverity[]): AlertSeverity | null {
  return levels.reduce<AlertSeverity | null>((top, level) => (!top || RANK[level] > RANK[top] ? level : top), null);
}

/** Each LGA's most severe alert in force, for colouring a map of LGAs. */
export function severityByLga(alerts: FloodAlert[]): Record<string, AlertSeverity> {
  const result: Record<string, AlertSeverity> = {};
  for (const alert of alerts) {
    if (alert.status !== "active") continue;
    for (const id of alert.lgaIds) {
      const current = result[id];
      if (!current || RANK[alert.severity] > RANK[current]) result[id] = alert.severity;
    }
  }
  return result;
}

/** Alerts most severe first, then newest. */
export function sortAlerts(alerts: FloodAlert[]): FloodAlert[] {
  return [...alerts].sort((a, b) => RANK[b.severity] - RANK[a.severity] || b.startsAt.localeCompare(a.startsAt));
}

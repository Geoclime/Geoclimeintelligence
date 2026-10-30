// Mirrors server/src/modules/alerts/alert.types.ts.

export const ALERT_SEVERITIES = ["watch", "warning", "severe"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export type AlertStatus = "scheduled" | "active" | "expired" | "ended";

export interface AlertAreaRef {
  id: string;
  unitName: string;
  levelName: string;
  level: number;
}

export interface FloodAlert {
  id: string;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  actions: string[];
  startsAt: string;
  expiresAt: string;
  endedAt: string | null;
  areas: AlertAreaRef[];
  /** Every LGA the alert covers, a state's LGAs included. */
  lgaIds: string[];
  createdAt: string;
}

/** Body for POST /api/v1/alerts. Times are ISO strings; startsAt defaults to now. */
export interface NewAlertBody {
  severity: AlertSeverity;
  title: string;
  message: string;
  actions: string[];
  areaIds: string[];
  startsAt?: string;
  expiresAt: string;
}

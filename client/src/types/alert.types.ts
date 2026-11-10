// Mirrors server/src/modules/alerts/alert.types.ts.

export const ALERT_SEVERITIES = ["watch", "warning", "severe"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export type AlertStatus = "scheduled" | "active" | "expired" | "ended";

export interface AlertAreaRef {
  id: string;
  unitName: string;
  levelName: string;
  level: number;
  /** The LGA a ward is in; wards share names across LGAs. Null for LGAs and states. */
  parentName?: string | null;
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
  /** Every LGA the alert covers whole, a state's LGAs included. A ward alone does not add its LGA. */
  lgaIds: string[];
  /** The wards the alert names. Optional so a reply without it (an older cached one) still reads as "no wards". */
  wardIds?: string[];
  /** The LGAs that hold a ward the alert names. */
  wardLgaIds?: string[];
  createdAt: string;
}

/**
 * Body for PATCH /api/v1/alerts/:id: send only what changes. `expiresAt` is the new end time.
 * `notify` tells everyone the alert covers about the change; leave it off for a small correction.
 */
export interface UpdateAlertBody {
  severity?: AlertSeverity;
  title?: string;
  message?: string;
  actions?: string[];
  areaIds?: string[];
  expiresAt?: string;
  notify?: boolean;
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

/** Watch < warning < severe. Mirrored by the flood_alerts CHECK constraint. */
export const ALERT_SEVERITIES = ["watch", "warning", "severe"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

/** Worked out from the alert's times when it is read, never stored. */
export type AlertStatus = "scheduled" | "active" | "expired" | "ended";

/** Alerts cover LGAs or whole states; a ward is too small to warn about on its own. */
export const ALERT_AREA_LEVELS = [1, 2] as const;

export interface AlertAreaRef {
  id: string;
  unitName: string;
  levelName: string;
  level: number;
}

export interface FloodAlertDto {
  id: string;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  /** One recommended action per line, e.g. "Move valuables to higher ground." */
  actions: string[];
  startsAt: string;
  expiresAt: string;
  endedAt: string | null;
  /** The areas as issued: LGAs and/or states. */
  areas: AlertAreaRef[];
  /** Every LGA the alert covers (a state's LGAs included), for colouring a map of LGAs. */
  lgaIds: string[];
  createdAt: string;
}

/** A row as the repository reads it, before the status is worked out. */
export interface FloodAlertRow extends Omit<FloodAlertDto, "status" | "actions" | "startsAt" | "expiresAt" | "endedAt" | "createdAt"> {
  actions: string;
  startsAt: Date;
  expiresAt: Date;
  endedAt: Date | null;
  createdAt: Date;
}

export interface NewFloodAlert {
  severity: AlertSeverity;
  title: string;
  message: string;
  actions: string[];
  startsAt: Date;
  expiresAt: Date;
  areaIds: string[];
  createdBy: string;
}

/** What may be changed on an alert that is still in force or scheduled. Anything left out stays as it is. */
export interface FloodAlertPatch {
  severity?: AlertSeverity;
  title?: string;
  message?: string;
  actions?: string[];
  expiresAt?: Date;
  /** Replaces the whole list of areas. */
  areaIds?: string[];
}

export interface AlertListFilter {
  /** "active": in force now. "recent": active, scheduled, or ended/expired in the last 30 days. */
  view: "active" | "recent";
  limit: number;
}

/** What services depend on, so they can be unit-tested with an in-memory fake (section 2). */
export interface IAlertRepository {
  create(input: NewFloodAlert): Promise<string>;
  findAlert(id: string): Promise<FloodAlertRow | null>;
  findList(filter: AlertListFilter): Promise<FloodAlertRow[]>;
  /** Ends an alert early; false if it doesn't exist or has already ended. */
  end(id: string, at: Date): Promise<boolean>;
  /** Changes an alert (and, with areaIds, its areas, together); false if it doesn't exist. */
  update(id: string, patch: FloodAlertPatch): Promise<boolean>;
  /** Deletes an alert and its areas; false if it doesn't exist. */
  remove(id: string): Promise<boolean>;
}

export function alertStatus(row: Pick<FloodAlertRow, "startsAt" | "expiresAt" | "endedAt">, now: Date): AlertStatus {
  if (row.endedAt) return "ended";
  if (row.expiresAt <= now) return "expired";
  if (row.startsAt > now) return "scheduled";
  return "active";
}

export function toAlertDto(row: FloodAlertRow, now: Date): FloodAlertDto {
  return {
    ...row,
    status: alertStatus(row, now),
    actions: row.actions.split("\n").map((line) => line.trim()).filter(Boolean),
    startsAt: row.startsAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

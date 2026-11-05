/**
 * The activity log (migration CreateAuditTrail): who did what to the record of the ground, kept for
 * good. Each action has a fixed name, so the log can be filtered by it.
 */
export const AUDIT_ACTIONS = [
  "flood.recorded",
  "flood.receded",
  "flood.reopened",
  "flood.deleted",
  "drain.recorded",
  "drain.inspected",
  "drain.deleted",
  "drain.imported",
  "place.saved",
  "place.updated",
  "place.deleted",
  "household.saved",
  "household.deleted",
  "photo.added",
  "photo.deleted",
  "role.created",
  "role.updated",
  "role.deleted",
  "user.access_changed",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITY_TYPES = ["flood_extent", "drain", "place", "household", "photo", "role", "user"] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

/** Who did it, copied onto the row so it still reads after the account is deleted. */
export interface AuditActor {
  id: string;
  displayName: string | null;
  email: string | null;
  role: string;
}

export interface AuditEntry {
  action: AuditAction;
  entityType: AuditEntityType;
  /** Null for something with no id of its own (a role is named by its code, kept in details). */
  entityId: string | null;
  lgaId?: string | null;
  wardId?: string | null;
  /** One line a person can read: "Inspected Aba Road drain: blocked → clear". */
  summary: string;
  /** What changed, for whoever needs more than the summary (before and after values, counts...). */
  details?: Record<string, unknown>;
}

export interface AuditEventDto {
  id: string;
  occurredAt: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string | null;
  lgaId: string | null;
  lgaName: string | null;
  wardId: string | null;
  wardName: string | null;
  summary: string;
  details: Record<string, unknown>;
}

export interface AuditQuery {
  actorId?: string;
  action?: AuditAction;
  entityType?: AuditEntityType;
  entityId?: string;
  /** An LGA or ward: events in it (or, for an LGA, in its wards). */
  areaId?: string;
  /** Inclusive, ISO dates (YYYY-MM-DD) in UTC. */
  from?: string;
  to?: string;
  /** Free text over the summary and the actor's name and email. */
  q?: string;
}

export interface IAuditRepository {
  insert(actor: AuditActor, entry: AuditEntry): Promise<void>;
  /** Newest first, a page at a time; `total` counts every match. */
  findPage(query: AuditQuery, page: number, pageSize: number): Promise<{ items: AuditEventDto[]; total: number }>;
  /** Every match, newest first, up to `limit`: for the CSV export. */
  findAll(query: AuditQuery, limit: number): Promise<AuditEventDto[]>;
}

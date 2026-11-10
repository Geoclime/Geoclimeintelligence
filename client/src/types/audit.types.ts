/** Mirrors server/src/modules/audit/audit.types.ts. */
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
  "household.photo_added",
  "household.photo_deleted",
  "photo.added",
  "photo.deleted",
  "role.created",
  "role.updated",
  "role.deleted",
  "user.access_changed",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEntityType = "flood_extent" | "drain" | "place" | "household" | "photo" | "role" | "user";

export interface AuditEvent {
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

export interface AuditFilters {
  actorId?: string;
  action?: AuditAction;
  entityType?: AuditEntityType;
  areaId?: string;
  from?: string;
  to?: string;
  q?: string;
}

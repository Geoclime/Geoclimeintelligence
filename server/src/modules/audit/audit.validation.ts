import { z } from "zod";
import { offsetPageQuerySchema } from "../../common/pagination/pagination";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "./audit.types";

const blank = (value: unknown) => (value === "" ? undefined : value);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-05");

const filters = z.object({
  actorId: z.preprocess(blank, z.uuid().optional()),
  action: z.preprocess(blank, z.enum(AUDIT_ACTIONS).optional()),
  entityType: z.preprocess(blank, z.enum(AUDIT_ENTITY_TYPES).optional()),
  entityId: z.preprocess(blank, z.uuid().optional()),
  areaId: z.preprocess(blank, z.uuid().optional()),
  from: z.preprocess(blank, isoDate.optional()),
  to: z.preprocess(blank, isoDate.optional()),
  q: z.preprocess(blank, z.string().trim().max(100).optional()),
});

/** GET /api/v1/audit-events?page=&pageSize=&actorId=&action=&entityType=&entityId=&areaId=&from=&to=&q= */
export const listAuditSchema = z.object({ query: offsetPageQuerySchema.extend(filters.shape) });
export type ListAuditQuery = z.infer<typeof listAuditSchema>["query"];

/** GET /api/v1/audit-events/export.csv with the same filters. */
export const exportAuditSchema = z.object({ query: filters });
export type ExportAuditQuery = z.infer<typeof exportAuditSchema>["query"];

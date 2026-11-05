import { AppDataSource } from "../../config/data-source";
import type { AuditActor, AuditEntry, AuditEventDto, AuditQuery, IAuditRepository } from "./audit.types";

/**
 * The activity log. Only ever INSERTs: the table refuses updates and deletes (a trigger), so nothing
 * here could change history even by mistake. Not a BaseRepository, since it has no entity to load.
 */

type Row = Omit<AuditEventDto, "occurredAt"> & { occurredAt: Date };

const SELECT = `
  SELECT e.id, e.occurred_at AS "occurredAt", e.actor_id AS "actorId", e.actor_name AS "actorName",
         e.actor_email AS "actorEmail", e.actor_role AS "actorRole", e.action, e.entity_type AS "entityType",
         e.entity_id AS "entityId", e.lga_id AS "lgaId", l.unit_name AS "lgaName", e.ward_id AS "wardId",
         w.unit_name AS "wardName", e.summary, e.details
    FROM audit_events e
    LEFT JOIN admin_units l ON l.id = e.lga_id
    LEFT JOIN admin_units w ON w.id = e.ward_id`;

/** The WHERE clause and its parameters for a query. Every value is a parameter, never spliced in. */
function where(query: AuditQuery): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const add = (clause: (n: string) => string, value: unknown) => {
    params.push(value);
    clauses.push(clause(`$${params.length}`));
  };
  if (query.actorId) add((p) => `e.actor_id = ${p}::uuid`, query.actorId);
  if (query.action) add((p) => `e.action = ${p}`, query.action);
  if (query.entityType) add((p) => `e.entity_type = ${p}`, query.entityType);
  if (query.entityId) add((p) => `e.entity_id = ${p}::uuid`, query.entityId);
  if (query.areaId) add((p) => `(e.lga_id = ${p}::uuid OR e.ward_id = ${p}::uuid)`, query.areaId);
  if (query.from) add((p) => `e.occurred_at >= ${p}::date`, query.from);
  if (query.to) add((p) => `e.occurred_at < (${p}::date + 1)`, query.to);
  if (query.q) {
    add(
      (p) => `(e.summary ILIKE ${p} OR e.actor_name ILIKE ${p} OR e.actor_email ILIKE ${p})`,
      `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
    );
  }
  return { sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

const toDto = (row: Row): AuditEventDto => ({ ...row, occurredAt: row.occurredAt.toISOString() });

export class AuditRepository implements IAuditRepository {
  private static _instance?: AuditRepository;
  static get Instance(): AuditRepository {
    return (this._instance ??= new AuditRepository());
  }

  async insert(actor: AuditActor, entry: AuditEntry): Promise<void> {
    await AppDataSource.query(
      `INSERT INTO audit_events (actor_id, actor_name, actor_email, actor_role, action, entity_type, entity_id, lga_id, ward_id, summary, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [
        actor.id, actor.displayName, actor.email, actor.role, entry.action, entry.entityType, entry.entityId,
        entry.lgaId ?? null, entry.wardId ?? null, entry.summary.slice(0, 300), JSON.stringify(entry.details ?? {}),
      ],
    );
  }

  async findPage(query: AuditQuery, page: number, pageSize: number): Promise<{ items: AuditEventDto[]; total: number }> {
    const { sql, params } = where(query);
    const n = params.length;
    const [rows, [count]]: [Row[], { total: number }[]] = await Promise.all([
      AppDataSource.query(`${SELECT} ${sql} ORDER BY e.occurred_at DESC, e.id DESC LIMIT $${n + 1}::int OFFSET $${n + 2}::int`, [
        ...params,
        pageSize,
        (page - 1) * pageSize,
      ]),
      AppDataSource.query(`SELECT count(*)::int AS total FROM audit_events e ${sql}`, params),
    ]);
    return { items: rows.map(toDto), total: count?.total ?? 0 };
  }

  async findAll(query: AuditQuery, limit: number): Promise<AuditEventDto[]> {
    const { sql, params } = where(query);
    const rows: Row[] = await AppDataSource.query(`${SELECT} ${sql} ORDER BY e.occurred_at DESC, e.id DESC LIMIT $${params.length + 1}::int`, [...params, limit]);
    return rows.map(toDto);
  }
}

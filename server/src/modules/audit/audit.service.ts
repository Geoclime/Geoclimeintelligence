import type { AuthUser } from "../../common/access/auth-user";
import type { PageMeta } from "../../common/response/api-response";
import { logger } from "../../config/logger";
import { AuditRepository } from "./audit.repository";
import type { AuditEntry, AuditEventDto, AuditQuery, IAuditRepository } from "./audit.types";

/** The most rows one CSV export holds: a year of a busy state, and still a file a spreadsheet opens. */
export const AUDIT_EXPORT_LIMIT = 50_000;

/**
 * Writes and reads the activity log. Services call `record` after a change has been saved. If the log
 * can't be written, the change stands (it already happened) and the failure is logged loudly with the
 * whole entry, so the record can be put right by hand; nothing is silently dropped. A drain inspection
 * is also kept in drain_inspections, written in the same statement as the change itself.
 */
export class AuditService {
  private static _instance?: AuditService;
  static get Instance(): AuditService {
    return (this._instance ??= new AuditService(AuditRepository.Instance));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(private readonly events: IAuditRepository) {}

  async record(actor: AuthUser, entry: AuditEntry): Promise<void> {
    try {
      await this.events.insert({ id: actor.id, displayName: actor.displayName, email: actor.email, role: actor.role }, entry);
    } catch (err) {
      logger.error({ err, actorId: actor.id, entry }, "Could not write to the activity log");
    }
  }

  async list(query: AuditQuery, page: number, pageSize: number): Promise<{ items: AuditEventDto[]; meta: PageMeta }> {
    const { items, total } = await this.events.findPage(query, page, pageSize);
    return { items, meta: { page, pageSize, total } };
  }

  /** The log as CSV, newest first, with a header row. Values that a spreadsheet would run as a formula are made plain text. */
  async exportCsv(query: AuditQuery): Promise<string> {
    const rows = await this.events.findAll(query, AUDIT_EXPORT_LIMIT);
    const header = ["When (UTC)", "Who", "Email", "Role", "Action", "What", "Record id", "LGA", "Ward", "Summary", "Details"];
    const lines = rows.map((row) =>
      [
        row.occurredAt,
        row.actorName ?? "",
        row.actorEmail ?? "",
        row.actorRole,
        row.action,
        row.entityType,
        row.entityId ?? "",
        row.lgaName ?? "",
        row.wardName ?? "",
        row.summary,
        JSON.stringify(row.details),
      ]
        .map(csvCell)
        .join(","),
    );
    return [header.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
  }
}

/** Quotes a cell, and puts a ' before anything starting = + - @, which Excel would otherwise run as a formula. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

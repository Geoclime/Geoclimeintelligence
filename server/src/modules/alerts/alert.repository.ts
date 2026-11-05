import { AppDataSource } from "../../config/data-source";
import { BaseRepository } from "../../common/repository/base.repository";
import type { AlertListFilter, FloodAlertPatch, FloodAlertRow, IAlertRepository, NewFloodAlert } from "./alert.types";
import { FloodAlert } from "./flood-alert.entity";

// One query reads an alert with its areas and every LGA it covers: an LGA itself, or a state's
// LGAs (alerts are only ever issued for levels 1 and 2).
const SELECT_ALERTS = `
  SELECT a.id, a.severity, a.title, a.message, a.actions,
         a.starts_at AS "startsAt", a.expires_at AS "expiresAt", a.ended_at AS "endedAt", a.created_at AS "createdAt",
         COALESCE(
           json_agg(DISTINCT jsonb_build_object('id', au.id, 'unitName', au.unit_name, 'levelName', au.level_name, 'level', au.level))
             FILTER (WHERE au.id IS NOT NULL), '[]') AS areas,
         COALESCE(array_agg(DISTINCT lga.id::text) FILTER (WHERE lga.id IS NOT NULL), '{}') AS "lgaIds"
    FROM flood_alerts a
    LEFT JOIN flood_alert_areas fa ON fa.alert_id = a.id
    LEFT JOIN admin_units au ON au.id = fa.admin_unit_id
    LEFT JOIN admin_units lga ON lga.level = 2 AND (lga.id = au.id OR lga.parent_id = au.id)`;

const ACTIVE = `a.ended_at IS NULL AND a.starts_at <= now() AND a.expires_at > now()`;

export class AlertRepository extends BaseRepository<FloodAlert> implements IAlertRepository {
  private static _instance?: AlertRepository;
  static get Instance(): AlertRepository {
    return (this._instance ??= new AlertRepository());
  }

  protected readonly entity = FloodAlert;

  /** The alert and its areas in one transaction: never an alert without areas. */
  create(input: NewFloodAlert): Promise<string> {
    return AppDataSource.transaction(async (manager) => {
      const [row]: { id: string }[] = await manager.query(
        `INSERT INTO flood_alerts (severity, title, message, actions, starts_at, expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [input.severity, input.title, input.message, input.actions.join("\n"), input.startsAt, input.expiresAt, input.createdBy],
      );
      await manager.query(
        `INSERT INTO flood_alert_areas (alert_id, admin_unit_id) SELECT $1, unnest($2::uuid[])`,
        [row!.id, input.areaIds],
      );
      return row!.id;
    });
  }

  async findAlert(id: string): Promise<FloodAlertRow | null> {
    const rows: FloodAlertRow[] = await this.repo.query(`${SELECT_ALERTS} WHERE a.id = $1 GROUP BY a.id`, [id]);
    return rows[0] ?? null;
  }

  /** Most severe first, then newest. */
  findList({ view, limit }: AlertListFilter): Promise<FloodAlertRow[]> {
    const where = view === "active" ? ACTIVE : `(${ACTIVE}) OR a.starts_at > now() OR a.created_at > now() - interval '30 days'`;
    return this.repo.query(
      `${SELECT_ALERTS}
        WHERE ${where}
        GROUP BY a.id
        ORDER BY (${ACTIVE}) DESC, CASE a.severity WHEN 'severe' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, a.starts_at DESC
        LIMIT $1`,
      [limit],
    );
  }

  /** Changed fields and the areas in one transaction: an alert never has half an edit, or no areas. */
  update(id: string, patch: FloodAlertPatch): Promise<boolean> {
    return AppDataSource.transaction(async (manager) => {
      // Column names below are fixed literals, never input; values are always parameters.
      const params: unknown[] = [id];
      const sets: string[] = [];
      const set = (column: string, value: unknown) => {
        params.push(value);
        sets.push(`${column} = ${params.length}`);
      };
      if (patch.severity !== undefined) set("severity", patch.severity);
      if (patch.title !== undefined) set("title", patch.title);
      if (patch.message !== undefined) set("message", patch.message);
      if (patch.actions !== undefined) set("actions", patch.actions.join("\n"));
      if (patch.expiresAt !== undefined) set("expires_at", patch.expiresAt);
      sets.push("updated_at = now()");

      const rows: { n: number }[] = await manager.query(
        `WITH changed AS (UPDATE flood_alerts SET ${sets.join(", ")} WHERE id = $1 RETURNING id) SELECT count(*)::int AS n FROM changed`,
        params,
      );
      if ((rows[0]?.n ?? 0) === 0) return false;

      if (patch.areaIds !== undefined) {
        await manager.query(`DELETE FROM flood_alert_areas WHERE alert_id = $1`, [id]);
        await manager.query(`INSERT INTO flood_alert_areas (alert_id, admin_unit_id) SELECT $1, unnest($2::uuid[])`, [id, patch.areaIds]);
      }
      return true;
    });
  }

  /** The areas go with it (ON DELETE CASCADE). */
  async remove(id: string): Promise<boolean> {
    const rows: { n: number }[] = await this.repo.query(
      `WITH gone AS (DELETE FROM flood_alerts WHERE id = $1 RETURNING id) SELECT count(*)::int AS n FROM gone`,
      [id],
    );
    return (rows[0]?.n ?? 0) > 0;
  }

  async end(id: string, at: Date): Promise<boolean> {
    // Wrapped in a CTE so the driver returns a plain row, not UPDATE's [rows, count] pair.
    const rows: { n: number }[] = await this.repo.query(
      `WITH ended AS (
         UPDATE flood_alerts SET ended_at = $2, updated_at = now() WHERE id = $1 AND ended_at IS NULL RETURNING id
       )
       SELECT count(*)::int AS n FROM ended`,
      [id, at],
    );
    return (rows[0]?.n ?? 0) > 0;
  }
}

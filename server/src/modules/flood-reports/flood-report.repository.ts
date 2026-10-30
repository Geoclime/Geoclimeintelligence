import { AppDataSource } from "../../config/data-source";
import { BaseRepository } from "../../common/repository/base.repository";
import type { PageMeta } from "../../common/response/api-response";
import { FloodReport } from "./flood-report.entity";
import type {
  FloodReportFilter,
  FloodReportMediaRow,
  FloodReportRow,
  IFloodReportRepository,
  NewFloodReport,
  PublicReportPoint,
  ReviewDecision,
} from "./flood-report.types";

// Media bytes are never read here except by findMedia: lists carry each file's id, size and, for a
// Cloudinary file, where it is (so the service can sign a link to it).
const MEDIA_FIELDS = `'id', m.id, 'kind', m.kind, 'mimeType', m.mime_type, 'byteSize', m.byte_size, 'storage', m.storage,
  'publicId', m.public_id, 'resourceType', m.resource_type, 'format', m.format, 'version', m.version`;
const SELECT_REPORTS = `
  SELECT r.id, r.reporter_id AS "reporterId", u.display_name AS "reporterName", u.organisation AS "reporterOrganisation",
         ARRAY[ST_X(r.geom), ST_Y(r.geom)] AS point, r.location_name AS "locationName",
         r.lga_id AS "lgaId", lga.unit_name AS "lgaName", r.ward_id AS "wardId", ward.unit_name AS "wardName",
         r.water_depth AS "waterDepth", r.description, r.status, r.review_note AS "reviewNote",
         r.reviewed_at AS "reviewedAt", r.created_at AS "createdAt",
         COALESCE((SELECT json_agg(json_build_object(${MEDIA_FIELDS})
                                   ORDER BY m.created_at)
                     FROM flood_report_media m WHERE m.report_id = r.id), '[]') AS media
    FROM flood_reports r
    LEFT JOIN admin_units lga ON lga.id = r.lga_id
    LEFT JOIN admin_units ward ON ward.id = r.ward_id
    LEFT JOIN users u ON u.id = r.reporter_id`;

export class FloodReportRepository extends BaseRepository<FloodReport> implements IFloodReportRepository {
  private static _instance?: FloodReportRepository;
  static get Instance(): FloodReportRepository {
    return (this._instance ??= new FloodReportRepository());
  }

  protected readonly entity = FloodReport;

  /** The report and its media in one transaction: never half a report. */
  create(input: NewFloodReport): Promise<string> {
    return AppDataSource.transaction(async (manager) => {
      const [row]: { id: string }[] = await manager.query(
        `INSERT INTO flood_reports (reporter_id, geom, location_name, lga_id, ward_id, water_depth, description)
         VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5, $6, $7, $8) RETURNING id`,
        [input.reporterId, input.point[0], input.point[1], input.locationName, input.lgaId, input.wardId, input.waterDepth, input.description],
      );
      for (const file of input.media) {
        if (file.storage === "database") {
          await manager.query(
            `INSERT INTO flood_report_media (report_id, kind, mime_type, byte_size, storage, data) VALUES ($1, $2, $3, $4, 'database', $5)`,
            [row!.id, file.kind, file.mimeType, file.data.length, file.data],
          );
        } else {
          const { publicId, resourceType, format, version, byteSize } = file.stored;
          await manager.query(
            `INSERT INTO flood_report_media (report_id, kind, mime_type, byte_size, storage, public_id, resource_type, format, version)
             VALUES ($1, $2, $3, $4, 'cloudinary', $5, $6, $7, $8)`,
            [row!.id, file.kind, file.mimeType, byteSize, publicId, resourceType, format, version],
          );
        }
      }
      return row!.id;
    });
  }

  async findReport(id: string): Promise<FloodReportRow | null> {
    const rows: FloodReportRow[] = await this.repo.query(`${SELECT_REPORTS} WHERE r.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async findReportPage(filter: FloodReportFilter): Promise<{ items: FloodReportRow[]; meta: PageMeta }> {
    // An empty scope means "nothing", never "no filter" (region-access.ts).
    const where = `WHERE ($1::text IS NULL OR r.status = $1)
        AND ($2::uuid IS NULL OR r.reporter_id = $2)
        AND ($3::uuid[] IS NULL OR r.lga_id = ANY($3) OR r.ward_id = ANY($3))`;
    const params = [filter.status ?? null, filter.reporterId ?? null, filter.scopeAdminUnitIds ?? null];
    // The review queue is first come, first served; everything else is newest first.
    const order = filter.status === "pending" ? "ASC" : "DESC";
    const [items, [count]] = await Promise.all([
      this.repo.query(`${SELECT_REPORTS} ${where} ORDER BY r.created_at ${order}, r.id LIMIT $4 OFFSET $5`, [
        ...params,
        filter.pageSize,
        (filter.page - 1) * filter.pageSize,
      ]) as Promise<FloodReportRow[]>,
      this.repo.query(`SELECT count(*)::int AS total FROM flood_reports r ${where}`, params) as Promise<{ total: number }[]>,
    ]);
    return { items, meta: { page: filter.page, pageSize: filter.pageSize, total: count?.total ?? 0 } };
  }

  async review(id: string, decision: ReviewDecision): Promise<boolean> {
    const rows: { n: number }[] = await this.repo.query(
      `WITH done AS (
         UPDATE flood_reports SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = $5, updated_at = now()
          WHERE id = $1 AND status = 'pending' RETURNING id
       )
       SELECT count(*)::int AS n FROM done`,
      [id, decision.status, decision.note, decision.reviewerId, decision.at],
    );
    return (rows[0]?.n ?? 0) > 0;
  }

  async findMedia(reportId: string, mediaId: string): Promise<(FloodReportMediaRow & { data: Buffer | null }) | null> {
    const rows: (FloodReportMediaRow & { data: Buffer | null })[] = await this.repo.query(
      `SELECT id, kind, mime_type AS "mimeType", byte_size AS "byteSize", storage, public_id AS "publicId",
              resource_type AS "resourceType", format, version::float8 AS version, data
         FROM flood_report_media WHERE id = $1 AND report_id = $2`,
      [mediaId, reportId],
    );
    return rows[0] ?? null;
  }

  async countSince(reporterId: string, since: Date): Promise<number> {
    const rows: { n: number }[] = await this.repo.query(
      `SELECT count(*)::int AS n FROM flood_reports WHERE reporter_id = $1 AND created_at >= $2`,
      [reporterId, since],
    );
    return rows[0]?.n ?? 0;
  }

  findPublishedSince(since: Date, limit: number): Promise<PublicReportPoint[]> {
    // Rounded to 3 decimals (about 110 m): enough to see where flooding is, not whose door it is.
    return this.repo.query(
      `SELECT r.id,
              ARRAY[round(ST_X(r.geom)::numeric, 3)::float8, round(ST_Y(r.geom)::numeric, 3)::float8] AS point,
              r.water_depth AS "waterDepth", lga.unit_name AS "lgaName", to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt"
         FROM flood_reports r
         LEFT JOIN admin_units lga ON lga.id = r.lga_id
        WHERE r.status = 'published' AND r.created_at >= $1
        ORDER BY r.created_at DESC
        LIMIT $2`,
      [since, limit],
    );
  }
}

import { AppDataSource } from "../../config/data-source";
import type { StoredResourceType } from "../../common/storage/media-storage";
import type { IPhotoRepository, NewPhoto, PhotoDto, PhotoRecord, PhotoSubject, PhotoSubjectInfo, PhotoSubjectType } from "./photo.types";

/** Which column of map_photos holds each kind of subject. Fixed text, never from a request. */
const COLUMN: Record<PhotoSubjectType, string> = {
  flood: "flood_extent_id",
  drain: "drain_id",
  inspection: "inspection_id",
  place: "facility_id",
};

/** The subject's own shape, for how far from it a photo was taken. */
const SUBJECT_GEOM = `
  CASE
    WHEN p.flood_extent_id IS NOT NULL THEN (SELECT geom FROM flood_extents WHERE id = p.flood_extent_id)
    WHEN p.drain_id IS NOT NULL THEN (SELECT geom FROM drainage_features WHERE id = p.drain_id)
    WHEN p.inspection_id IS NOT NULL THEN (SELECT d.geom FROM drain_inspections i JOIN drainage_features d ON d.id = i.drain_id WHERE i.id = p.inspection_id)
    ELSE (SELECT geom FROM infrastructure WHERE id = p.facility_id)
  END`;

const SELECT = `
  SELECT p.id,
         CASE WHEN p.flood_extent_id IS NOT NULL THEN 'flood' WHEN p.drain_id IS NOT NULL THEN 'drain'
              WHEN p.inspection_id IS NOT NULL THEN 'inspection' ELSE 'place' END AS "subjectType",
         COALESCE(p.flood_extent_id, p.drain_id, p.inspection_id, p.facility_id) AS "subjectId",
         p.caption, p.taken_at AS "takenAt",
         CASE WHEN p.taken_point IS NULL THEN NULL ELSE ST_Distance(p.taken_point::geography, (${SUBJECT_GEOM})::geography) END AS "distanceM",
         p.uploaded_by AS "uploadedBy", COALESCE(u.display_name, p.uploader_name) AS "uploaderName",
         p.byte_size AS "byteSize", p.mime_type AS "mimeType"
    FROM map_photos p
    LEFT JOIN users u ON u.id = p.uploaded_by`;

type Row = Omit<PhotoDto, "takenAt"> & { takenAt: Date };
const toDto = (row: Row): PhotoDto => ({ ...row, takenAt: row.takenAt.toISOString() });

/**
 * Photos of floods, drains, inspections and places saved by hand. Not a BaseRepository: a photo belongs
 * to one of four tables, so every query is written out here.
 */
export class PhotoRepository implements IPhotoRepository {
  private static _instance?: PhotoRepository;
  static get Instance(): PhotoRepository {
    return (this._instance ??= new PhotoRepository());
  }

  async subjectInfo(subject: PhotoSubject): Promise<PhotoSubjectInfo | null> {
    const count = `(SELECT count(*)::int FROM map_photos WHERE ${COLUMN[subject.type]} = $1)`;
    const sql: Record<PhotoSubjectType, string> = {
      flood: `SELECT lga_id AS "lgaId", ward_id AS "wardId", NULL AS origin, ${count} AS "photoCount",
                     'a flood of ' || round((area_m2 / 10000)::numeric, 1) || ' ha' AS title
                FROM flood_extents WHERE id = $1`,
      drain: `SELECT lga_id AS "lgaId", ward_id AS "wardId", NULL AS origin, ${count} AS "photoCount",
                     COALESCE(name, replace(kind, '_', ' ')) AS title
                FROM drainage_features WHERE id = $1`,
      inspection: `SELECT d.lga_id AS "lgaId", d.ward_id AS "wardId", NULL AS origin, ${count} AS "photoCount",
                          'an inspection of ' || COALESCE(d.name, replace(d.kind, '_', ' ')) AS title
                     FROM drain_inspections i JOIN drainage_features d ON d.id = i.drain_id WHERE i.id = $1`,
      place: `SELECT w.parent_id AS "lgaId", f.admin_unit_id AS "wardId", f.origin, ${count} AS "photoCount",
                     COALESCE(f.name, replace(f.osm_class, '_', ' ')) AS title
                FROM infrastructure f LEFT JOIN admin_units w ON w.id = f.admin_unit_id WHERE f.id = $1`,
    };
    const rows: PhotoSubjectInfo[] = await AppDataSource.query(sql[subject.type], [subject.id]);
    return rows[0] ?? null;
  }

  async insert(photo: NewPhoto): Promise<PhotoDto> {
    const file = photo.file;
    const [inserted]: { id: string }[] = await AppDataSource.query(
      `INSERT INTO map_photos (${COLUMN[photo.subject.type]}, storage, public_id, resource_type, format, version, data, mime_type, byte_size,
                               caption, taken_at, taken_point, taken_accuracy_m, uploaded_by, uploader_name)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11::timestamptz, now()),
               CASE WHEN $12::float8 IS NULL OR $13::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($12::float8, $13::float8), 4326) END,
               $14::float8, $15::uuid, $16)
       RETURNING id`,
      [
        photo.subject.id,
        file.storage,
        file.storage === "cloudinary" ? file.publicId : null,
        file.storage === "cloudinary" ? file.resourceType : null,
        file.storage === "cloudinary" ? file.format : null,
        file.storage === "cloudinary" ? file.version : null,
        file.storage === "database" ? file.data : null,
        photo.mimeType,
        photo.byteSize,
        photo.caption,
        photo.takenAt,
        photo.point?.[0] ?? null,
        photo.point?.[1] ?? null,
        photo.accuracyM,
        photo.uploadedBy,
        photo.uploaderName,
      ],
    );
    const [row]: Row[] = await AppDataSource.query(`${SELECT} WHERE p.id = $1`, [inserted!.id]);
    return toDto(row!);
  }

  async listFor(subject: PhotoSubject): Promise<PhotoDto[]> {
    const rows: Row[] = await AppDataSource.query(`${SELECT} WHERE p.${COLUMN[subject.type]} = $1 ORDER BY p.taken_at, p.id`, [subject.id]);
    return rows.map(toDto);
  }

  async findById(id: string): Promise<PhotoRecord | null> {
    type FileRow = Row & {
      storage: "database" | "cloudinary";
      data: Buffer | null;
      publicId: string | null;
      resourceType: StoredResourceType | null;
      format: string | null;
      version: string | null;
      lgaId: string | null;
      wardId: string | null;
    };
    const rows: FileRow[] = await AppDataSource.query(
      `WITH one AS (${SELECT} WHERE p.id = $1)
       SELECT one.*, p.storage, p.data, p.public_id AS "publicId", p.resource_type AS "resourceType", p.format, p.version::text AS version,
              COALESCE(fe.lga_id, d.lga_id, di.lga_id, w.parent_id) AS "lgaId",
              COALESCE(fe.ward_id, d.ward_id, di.ward_id, f.admin_unit_id) AS "wardId"
         FROM one
         JOIN map_photos p ON p.id = one.id
         LEFT JOIN flood_extents fe ON fe.id = p.flood_extent_id
         LEFT JOIN drainage_features d ON d.id = p.drain_id
         LEFT JOIN drain_inspections i ON i.id = p.inspection_id
         LEFT JOIN drainage_features di ON di.id = i.drain_id
         LEFT JOIN infrastructure f ON f.id = p.facility_id
         LEFT JOIN admin_units w ON w.id = f.admin_unit_id`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    const { storage, data, publicId, resourceType, format, version, lgaId, wardId, ...dto } = row;
    const file =
      storage === "database"
        ? { storage: "database" as const, data: data ?? Buffer.alloc(0) }
        : { storage: "cloudinary" as const, publicId: publicId ?? "", resourceType: resourceType ?? "image", format, version: Number(version) };
    return { ...toDto(dto), file, lgaId, wardId };
  }

  async delete(id: string): Promise<boolean> {
    const [row]: { n: number }[] = await AppDataSource.query(`WITH gone AS (DELETE FROM map_photos WHERE id = $1 RETURNING 1) SELECT count(*)::int AS n FROM gone`, [id]);
    return (row?.n ?? 0) > 0;
  }

  async cloudFilesFor(subject: { floodExtentId?: string; drainId?: string; facilityId?: string }): Promise<{ publicId: string; resourceType: StoredResourceType }[]> {
    const rows: { publicId: string; resourceType: StoredResourceType }[] = await AppDataSource.query(
      `SELECT public_id AS "publicId", resource_type AS "resourceType" FROM map_photos
        WHERE storage = 'cloudinary'
          AND (flood_extent_id = $1::uuid OR drain_id = $2::uuid OR facility_id = $3::uuid
               OR inspection_id IN (SELECT id FROM drain_inspections WHERE drain_id = $2::uuid))`,
      [subject.floodExtentId ?? null, subject.drainId ?? null, subject.facilityId ?? null],
    );
    return rows;
  }
}

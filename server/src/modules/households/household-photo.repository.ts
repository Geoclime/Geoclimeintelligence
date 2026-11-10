import type { StoredResourceType } from "../../common/storage/media-storage";
import { AppDataSource } from "../../config/data-source";
import type { HouseholdPhotoDto, HouseholdPhotoRecord, IHouseholdPhotoRepository, StoredHouseholdFile } from "./household-photo.types";

const COLUMNS = `id, household_id AS "householdId", mime_type AS "mimeType", byte_size AS "byteSize", created_at AS "createdAt"`;

type Row = Omit<HouseholdPhotoDto, "createdAt"> & { createdAt: Date };
const toDto = (row: Row): HouseholdPhotoDto => ({ ...row, createdAt: row.createdAt.toISOString() });

/** Photos of homes (migration AddPhonesHomeTypeAndHouseholdPhotos). Who may see or change one is decided in the service. */
export class HouseholdPhotoRepository implements IHouseholdPhotoRepository {
  private static _instance?: HouseholdPhotoRepository;
  static get Instance(): HouseholdPhotoRepository {
    return (this._instance ??= new HouseholdPhotoRepository());
  }

  async count(householdId: string): Promise<number> {
    const [row]: { n: number }[] = await AppDataSource.query(`SELECT count(*)::int AS n FROM household_photos WHERE household_id = $1`, [householdId]);
    return row?.n ?? 0;
  }

  async insert(householdId: string, file: StoredHouseholdFile, mimeType: string, byteSize: number): Promise<HouseholdPhotoDto> {
    const rows: Row[] = await AppDataSource.query(
      `INSERT INTO household_photos (household_id, storage, public_id, resource_type, format, version, data, mime_type, byte_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${COLUMNS}`,
      [
        householdId,
        file.storage,
        file.storage === "cloudinary" ? file.publicId : null,
        file.storage === "cloudinary" ? file.resourceType : null,
        file.storage === "cloudinary" ? file.format : null,
        file.storage === "cloudinary" ? file.version : null,
        file.storage === "database" ? file.data : null,
        mimeType,
        byteSize,
      ],
    );
    return toDto(rows[0]!);
  }

  async list(householdId: string): Promise<HouseholdPhotoDto[]> {
    const rows: Row[] = await AppDataSource.query(`SELECT ${COLUMNS} FROM household_photos WHERE household_id = $1 ORDER BY created_at, id`, [householdId]);
    return rows.map(toDto);
  }

  async findById(id: string): Promise<HouseholdPhotoRecord | null> {
    type FileRow = Row & {
      storage: "database" | "cloudinary";
      data: Buffer | null;
      publicId: string | null;
      resourceType: StoredResourceType | null;
      format: string | null;
      version: string | null;
    };
    const rows: FileRow[] = await AppDataSource.query(
      `SELECT ${COLUMNS}, storage, data, public_id AS "publicId", resource_type AS "resourceType", format, version::text AS version
         FROM household_photos WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    const { storage, data, publicId, resourceType, format, version, ...dto } = row;
    const file: StoredHouseholdFile =
      storage === "database"
        ? { storage: "database", data: data ?? Buffer.alloc(0) }
        : { storage: "cloudinary", publicId: publicId ?? "", resourceType: resourceType ?? "image", format, version: Number(version) };
    return { ...toDto(dto), file };
  }

  async delete(id: string): Promise<boolean> {
    const [row]: { n: number }[] = await AppDataSource.query(`WITH gone AS (DELETE FROM household_photos WHERE id = $1 RETURNING 1) SELECT count(*)::int AS n FROM gone`, [id]);
    return (row?.n ?? 0) > 0;
  }

  async cloudFilesOf(householdId: string): Promise<{ publicId: string; resourceType: StoredResourceType }[]> {
    return AppDataSource.query(
      `SELECT public_id AS "publicId", resource_type AS "resourceType" FROM household_photos WHERE household_id = $1 AND storage = 'cloudinary'`,
      [householdId],
    );
  }
}

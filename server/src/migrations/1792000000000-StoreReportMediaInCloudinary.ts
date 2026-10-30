import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Report media moves to Cloudinary, and gains videos and documents.
 *
 * A media row now says where its file is (`storage`):
 *   - 'cloudinary': the file is an authenticated Cloudinary asset (public_id, resource_type,
 *     format, version), delivered through signed links; `data` is empty;
 *   - 'database':   the file is in `data`, as before (photos and voice notes when no Cloudinary
 *     account is configured, and every row from before this migration).
 * The kinds grow to photo, audio, video and file (a PDF). The size cap rises to 100 MB for
 * Cloudinary files; the API keeps its own, smaller per-kind limits.
 */
export class StoreReportMediaInCloudinary1792000000000 implements MigrationInterface {
  name = "StoreReportMediaInCloudinary1792000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE flood_report_media
        ALTER COLUMN data DROP NOT NULL,
        ADD COLUMN storage       varchar(12)  NOT NULL DEFAULT 'database',
        ADD COLUMN public_id     varchar(255),
        ADD COLUMN resource_type varchar(8),
        ADD COLUMN format        varchar(16),
        ADD COLUMN version       bigint,
        DROP CONSTRAINT ck_flood_report_media_kind,
        DROP CONSTRAINT ck_flood_report_media_size,
        ADD CONSTRAINT ck_flood_report_media_kind CHECK (kind IN ('photo', 'audio', 'video', 'file')),
        ADD CONSTRAINT ck_flood_report_media_size CHECK (byte_size BETWEEN 1 AND 104857600),
        ADD CONSTRAINT ck_flood_report_media_storage CHECK (
          (storage = 'database' AND data IS NOT NULL)
          OR (storage = 'cloudinary' AND public_id IS NOT NULL AND resource_type IN ('image', 'video', 'raw') AND version IS NOT NULL)
        )
    `);
  }

  /** Fails while Cloudinary rows, videos or documents exist: their files aren't in the database to fall back to. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE flood_report_media
        DROP CONSTRAINT ck_flood_report_media_storage,
        DROP CONSTRAINT ck_flood_report_media_size,
        DROP CONSTRAINT ck_flood_report_media_kind,
        ADD CONSTRAINT ck_flood_report_media_kind CHECK (kind IN ('photo', 'audio')),
        ADD CONSTRAINT ck_flood_report_media_size CHECK (byte_size BETWEEN 1 AND 3145728),
        DROP COLUMN version,
        DROP COLUMN format,
        DROP COLUMN resource_type,
        DROP COLUMN public_id,
        DROP COLUMN storage,
        ALTER COLUMN data SET NOT NULL
    `);
  }
}

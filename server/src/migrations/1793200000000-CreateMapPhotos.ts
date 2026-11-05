import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Photos of what was recorded on the ground (docs/audit-and-permissions.md, "Photos").
 *
 * A photo belongs to exactly one thing: a flood, a drain, one inspection of a drain, or a place saved
 * by hand (`origin = 'manual'` facilities only, for now; checked by the service). Deleting the thing
 * deletes its photo rows; the service removes the files first.
 *
 * Files are stored like a flood report's (migration StoreReportMediaInCloudinary): as authenticated
 * Cloudinary assets, reachable only through signed links the server hands to someone whose role holds
 * photos.view, or, when no Cloudinary account is configured, in `data`, capped at 2 MB. They are never
 * on the public alert map. The browser shrinks each photo and strips its metadata (and so its GPS tag)
 * before upload; where it was taken is kept here, from the phone's own fix, only if it shared one.
 */
export class CreateMapPhotos1793200000000 implements MigrationInterface {
  name = "CreateMapPhotos1793200000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE map_photos (
        id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        flood_extent_id  uuid,
        drain_id         uuid,
        inspection_id    uuid,
        facility_id      uuid,
        storage          varchar(12)  NOT NULL,
        public_id        varchar(255),
        resource_type    varchar(8),
        format           varchar(16),
        version          bigint,
        data             bytea,
        mime_type        varchar(40)  NOT NULL,
        byte_size        integer      NOT NULL,
        caption          varchar(200),
        taken_at         timestamptz  NOT NULL DEFAULT now(),
        taken_point      geometry(Point, 4326),
        taken_accuracy_m double precision,
        uploaded_by      uuid,
        uploader_name    varchar(200),
        created_at       timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT fk_map_photos_flood FOREIGN KEY (flood_extent_id) REFERENCES flood_extents (id) ON DELETE CASCADE,
        CONSTRAINT fk_map_photos_drain FOREIGN KEY (drain_id) REFERENCES drainage_features (id) ON DELETE CASCADE,
        CONSTRAINT fk_map_photos_inspection FOREIGN KEY (inspection_id) REFERENCES drain_inspections (id) ON DELETE CASCADE,
        CONSTRAINT fk_map_photos_facility FOREIGN KEY (facility_id) REFERENCES infrastructure (id) ON DELETE CASCADE,
        CONSTRAINT fk_map_photos_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT ck_map_photos_one_subject CHECK (num_nonnulls(flood_extent_id, drain_id, inspection_id, facility_id) = 1),
        CONSTRAINT ck_map_photos_size CHECK (byte_size BETWEEN 1 AND 20971520),
        CONSTRAINT ck_map_photos_mime CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
        CONSTRAINT ck_map_photos_storage CHECK (
          (storage = 'database' AND data IS NOT NULL AND byte_size <= 2097152)
          OR (storage = 'cloudinary' AND public_id IS NOT NULL AND resource_type = 'image' AND version IS NOT NULL AND data IS NULL)
        )
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_map_photos_flood ON map_photos (flood_extent_id) WHERE flood_extent_id IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX idx_map_photos_drain ON map_photos (drain_id) WHERE drain_id IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX idx_map_photos_inspection ON map_photos (inspection_id) WHERE inspection_id IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX idx_map_photos_facility ON map_photos (facility_id) WHERE facility_id IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE map_photos`);
  }
}

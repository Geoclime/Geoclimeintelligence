import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * More to say about a place and a home.
 *
 * - `infrastructure.phone`: a phone number for a place saved by hand (international format, "+2348031234567").
 * - `households.home_type` (house, compound, apartment or other) and `households.phone`: what kind of home it
 *   is, and a number responders can call. Both are as private as the household itself (its owner and staff).
 * - `household_photos`: up to three photos of a home, kept like a map photo (a signed Cloudinary link, or in the
 *   database at no more than 2 MB without Cloudinary). Deleting a household deletes its photo rows; the service
 *   removes the Cloudinary files first.
 *
 * `down` drops all of it, including any photos and numbers saved since.
 */
export class AddPhonesHomeTypeAndHouseholdPhotos1793710000000 implements MigrationInterface {
  name = "AddPhonesHomeTypeAndHouseholdPhotos1793710000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE infrastructure
        ADD COLUMN phone varchar(16),
        ADD CONSTRAINT ck_infrastructure_phone CHECK (phone IS NULL OR phone ~ '^\\+[1-9][0-9]{7,14}$')
    `);
    await queryRunner.query(`
      ALTER TABLE households
        ADD COLUMN home_type varchar(12),
        ADD COLUMN phone varchar(16),
        ADD CONSTRAINT ck_households_home_type CHECK (home_type IS NULL OR home_type IN ('house', 'compound', 'apartment', 'other')),
        ADD CONSTRAINT ck_households_phone CHECK (phone IS NULL OR phone ~ '^\\+[1-9][0-9]{7,14}$')
    `);
    await queryRunner.query(`
      CREATE TABLE household_photos (
        id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        household_id  uuid         NOT NULL,
        storage       varchar(12)  NOT NULL,
        public_id     varchar(255),
        resource_type varchar(8),
        format        varchar(16),
        version       bigint,
        data          bytea,
        mime_type     varchar(40)  NOT NULL,
        byte_size     integer      NOT NULL,
        created_at    timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT fk_household_photos_household FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
        CONSTRAINT ck_household_photos_size CHECK (byte_size BETWEEN 1 AND 20971520),
        CONSTRAINT ck_household_photos_mime CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
        CONSTRAINT ck_household_photos_storage CHECK (
          (storage = 'database' AND data IS NOT NULL AND byte_size <= 2097152)
          OR (storage = 'cloudinary' AND public_id IS NOT NULL AND resource_type = 'image' AND version IS NOT NULL AND data IS NULL)
        )
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_household_photos_household ON household_photos (household_id)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE household_photos`);
    await queryRunner.query(`
      ALTER TABLE households
        DROP CONSTRAINT ck_households_phone,
        DROP CONSTRAINT ck_households_home_type,
        DROP COLUMN phone,
        DROP COLUMN home_type
    `);
    await queryRunner.query(`ALTER TABLE infrastructure DROP CONSTRAINT ck_infrastructure_phone, DROP COLUMN phone`);
  }
}

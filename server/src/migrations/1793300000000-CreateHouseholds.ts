import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Households: a person's own home (or homes) marked on the map (docs/households.md).
 *
 * A household is private: its owner sees it, and so do staff whose role holds the new
 * `households.view` permission (responders and officials as seeded, and administrators), for planning
 * and rescue. Nobody else does, and it is never on the public alert map. Its owner is told when a flood
 * alert covers its LGA or a flood is recorded near it, and a recorded flood counts the households it
 * reaches. An owner may add as many as they need. Deleting the account deletes its households.
 */
export class CreateHouseholds1793300000000 implements MigrationInterface {
  name = "CreateHouseholds1793300000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE households (
        id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id      uuid          NOT NULL,
        country_code  char(3)       NOT NULL,
        lga_id        uuid,
        ward_id       uuid,
        label         varchar(80)   NOT NULL,
        note          varchar(300),
        people        smallint,
        geom          geometry(Point, 4326) NOT NULL,
        created_at    timestamptz   NOT NULL DEFAULT now(),
        updated_at    timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT fk_households_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_households_country FOREIGN KEY (country_code) REFERENCES countries (country_code) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_households_lga FOREIGN KEY (lga_id) REFERENCES admin_units (id) ON DELETE SET NULL,
        CONSTRAINT fk_households_ward FOREIGN KEY (ward_id) REFERENCES admin_units (id) ON DELETE SET NULL,
        CONSTRAINT ck_households_people CHECK (people IS NULL OR people BETWEEN 1 AND 200),
        CONSTRAINT ck_households_geom_valid CHECK (ST_IsValid(geom) AND NOT ST_IsEmpty(geom))
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_households_geom ON households USING GIST (geom)`);
    await queryRunner.query(`CREATE INDEX idx_households_owner ON households (owner_id)`);
    await queryRunner.query(`CREATE INDEX idx_households_lga ON households (lga_id)`);

    // Staff see households, as they see who recorded a flood: responders and officials, as seeded.
    await queryRunner.query(`
      INSERT INTO role_permissions (role_code, permission)
      SELECT code, 'households.view' FROM roles WHERE code IN ('emergency_responder', 'government_official')
      ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM role_permissions WHERE permission = 'households.view'`);
    await queryRunner.query(`DROP TABLE households`);
  }
}

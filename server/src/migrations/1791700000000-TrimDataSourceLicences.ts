import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Data fix: a licence was saved as "CC BY 4.0," (a stray comma from a pasted list), and licences
 * are now shown publicly on the landing page. This trims trailing commas, semicolons and spaces
 * from every licence. New sources can't repeat it: createDataSourceSchema now strips them too.
 * Only rows that end that way are touched, so it is safe to run on any database.
 */
export class TrimDataSourceLicences1791700000000 implements MigrationInterface {
  name = "TrimDataSourceLicences1791700000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE data_sources
         SET license = regexp_replace(license, '[[:space:],;]+$', '')
       WHERE license ~ '[[:space:],;]+$'
    `);
  }

  /** Nothing to undo: the stray characters carried no meaning, and which rows had them isn't recorded. */
  async down(): Promise<void> {}
}

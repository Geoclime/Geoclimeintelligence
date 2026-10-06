import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

/**
 * Where a dataset came from: the provider, the link, the licence and when it was downloaded.
 * Every admin_units row points at one (source_id NOT NULL), so no shape is ever unsourced.
 *
 * Named DataSourceRecord because TypeORM already owns the name `DataSource`.
 */
@Entity("data_sources")
export class DataSourceRecord {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 200 })
  provider!: string;

  @Column({ name: "dataset_name", type: "varchar", length: 300 })
  datasetName!: string;

  @Column({ type: "text" })
  url!: string;

  @Column({ type: "varchar", length: 200 })
  license!: string;

  /** A calendar date (YYYY-MM-DD); the pg driver hands `date` columns back as strings. */
  @Column({ name: "downloaded_on", type: "date" })
  downloadedOn!: string;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @Column({ name: "created_by", type: "uuid", nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

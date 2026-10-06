import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";
import type {
  AdminUnitImportOptions,
  ColumnMapping,
  ImportFileType,
  ImportRunStatus,
  ImportTarget,
  StagingRowStatus,
} from "./import.types";

/** One uploaded file on its way into a live table: who, what, which source, and how it went. */
@Entity("import_runs")
export class ImportRun {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 40 })
  target!: ImportTarget;

  @Column({ name: "file_name", type: "varchar", length: 255 })
  fileName!: string;

  @Column({ name: "file_type", type: "varchar", length: 10 })
  fileType!: ImportFileType;

  @Column({ name: "sheet_name", type: "varchar", length: 100, nullable: true })
  sheetName!: string | null;

  @Column({ type: "jsonb" })
  options!: AdminUnitImportOptions;

  @Column({ name: "column_mapping", type: "jsonb" })
  columnMapping!: ColumnMapping;

  @Column({ name: "source_id", type: "uuid" })
  sourceId!: string;

  @Column({ type: "varchar", length: 20 })
  status!: ImportRunStatus;

  @Column({ name: "row_count", type: "integer", default: 0 })
  rowCount!: number;

  @Column({ name: "passed_count", type: "integer", default: 0 })
  passedCount!: number;

  @Column({ name: "error_count", type: "integer", default: 0 })
  errorCount!: number;

  @Column({ name: "promoted_count", type: "integer", nullable: true })
  promotedCount!: number | null;

  @Column({ type: "text", array: true, default: () => "'{}'" })
  warnings!: string[];

  @Column({ name: "created_by", type: "uuid" })
  createdBy!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "promoted_by", type: "uuid", nullable: true })
  promotedBy!: string | null;

  @Column({ name: "promoted_at", type: "timestamptz", nullable: true })
  promotedAt!: Date | null;
}

/** One row of an uploaded file, held back from the live table until its run is promoted. */
@Entity("import_staging_rows")
export class ImportStagingRow {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "run_id", type: "uuid" })
  runId!: string;

  @Column({ name: "row_number", type: "integer" })
  rowNumber!: number;

  /** The row exactly as read from the file. Never edited (raw data is preserved). */
  @Column({ type: "jsonb" })
  raw!: Record<string, string | null>;

  @Column({ name: "geom_source", type: "text", nullable: true })
  geomSource!: string | null;

  @Column({ name: "geom_format", type: "varchar", length: 10, nullable: true })
  geomFormat!: "wkt" | "geojson" | null;

  /** The cleaned shape (any type until checked), never selected by default. */
  @Column({ type: "geometry", srid: 4326, nullable: true, select: false })
  geom!: unknown;

  @Column({ type: "jsonb", default: () => "'{}'" })
  fields!: Record<string, unknown>;

  @Column({ type: "text", array: true, default: () => "'{}'" })
  errors!: string[];

  @Column({ type: "text", array: true, default: () => "'{}'" })
  warnings!: string[];

  @Column({ type: "varchar", length: 10, default: "pending" })
  status!: StagingRowStatus;
}

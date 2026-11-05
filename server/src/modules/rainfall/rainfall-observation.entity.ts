import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { RainfallDataType } from "./rainfall.types";

/**
 * One area's rainfall for one month (ERD `RAINFALL_OBSERVATIONS`), e.g. a CHIRPS monthly mean
 * for an LGA. Rows only arrive through a promoted import run.
 */
@Entity("rainfall_observations")
export class RainfallObservation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "country_code", type: "char", length: 3 })
  countryCode!: string;

  @Column({ name: "admin_unit_id", type: "uuid" })
  adminUnitId!: string;

  /** "YYYY-MM". */
  @Column({ name: "year_month", type: "char", length: 7 })
  yearMonth!: string;

  /** Null for a month the source hadn't finished yet; a later import fills it in. */
  @Column({ name: "mean_rainfall_mm", type: "numeric", precision: 8, scale: 3, nullable: true })
  meanRainfallMm!: string | null;

  @Column({ name: "data_type", type: "varchar", length: 12 })
  dataType!: RainfallDataType;

  @Column({ name: "source_id", type: "uuid" })
  sourceId!: string;

  /** The run that last wrote this month. Kept when the run is deleted (set to null). */
  @Column({ name: "import_run_id", type: "uuid", nullable: true })
  importRunId!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

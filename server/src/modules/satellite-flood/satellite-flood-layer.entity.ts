import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";
import type { SatelliteFloodLayerStatus } from "./satellite-flood.types";

/**
 * One imported month of satellite flood extent (see migration 1793400000000). The mask picture is
 * `select: false`, so listing the months for the map never drags a few hundred KB each along; the
 * repository reads it on its own, and writes the whole row in the import run's transaction.
 */
@Entity("satellite_flood_layers")
export class SatelliteFloodLayer {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "country_code", type: "char", length: 3 })
  countryCode!: string;

  @Column({ name: "import_run_id", type: "uuid", nullable: true })
  importRunId!: string | null;

  @Column({ name: "source_id", type: "uuid" })
  sourceId!: string;

  @Column({ type: "varchar", length: 10 })
  status!: SatelliteFloodLayerStatus;

  @Column({ name: "data_type", type: "varchar", length: 12, default: "DERIVED" })
  dataType!: string;

  @Column({ name: "year_month", type: "char", length: 7 })
  yearMonth!: string;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ type: "smallint" })
  zoom!: number;

  @Column({ name: "mask_png", type: "bytea", select: false })
  maskPng!: Buffer;

  @Column({ name: "image_width", type: "integer" })
  imageWidth!: number;

  @Column({ name: "image_height", type: "integer" })
  imageHeight!: number;

  @Column({ type: "double precision" })
  west!: number;

  @Column({ type: "double precision" })
  south!: number;

  @Column({ type: "double precision" })
  east!: number;

  @Column({ type: "double precision" })
  north!: number;

  @Column({ name: "flooded_km2", type: "numeric", precision: 12, scale: 3 })
  floodedKm2!: string;

  @Column({ name: "covered_km2", type: "numeric", precision: 12, scale: 3 })
  coveredKm2!: string;

  @Column({ name: "created_by", type: "uuid" })
  createdBy!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "promoted_at", type: "timestamptz", nullable: true })
  promotedAt!: Date | null;
}

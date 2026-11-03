import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";
import type { ClassCells, FloodRiskLayerStatus } from "./flood-risk.types";

/**
 * One imported flood risk map (see migration 1792700000000). The picture and the class grid are
 * `select: false`, so reading a layer for its legend never drags a few hundred KB along; the
 * repository reads them on their own, and writes the whole row in the import run's transaction.
 */
@Entity("flood_risk_layers")
export class FloodRiskLayer {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "country_code", type: "char", length: 3 })
  countryCode!: string;

  @Column({ name: "import_run_id", type: "uuid", nullable: true })
  importRunId!: string | null;

  @Column({ name: "source_id", type: "uuid" })
  sourceId!: string;

  @Column({ type: "varchar", length: 10 })
  status!: FloodRiskLayerStatus;

  @Column({ name: "data_type", type: "varchar", length: 12, default: "DERIVED" })
  dataType!: string;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ name: "source_crs", type: "varchar", length: 20 })
  sourceCrs!: string;

  @Column({ name: "cell_size_m", type: "double precision" })
  cellSizeM!: number;

  @Column({ name: "grid_width", type: "integer" })
  gridWidth!: number;

  @Column({ name: "grid_height", type: "integer" })
  gridHeight!: number;

  @Column({ name: "grid_origin_e", type: "double precision" })
  originE!: number;

  @Column({ name: "grid_origin_n", type: "double precision" })
  originN!: number;

  @Column({ name: "grid_gz", type: "bytea", select: false })
  gridGz!: Buffer;

  @Column({ name: "class_cells", type: "integer", array: true })
  classCells!: ClassCells;

  @Column({ name: "image_png", type: "bytea", select: false })
  imagePng!: Buffer;

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

  @Column({ name: "created_by", type: "uuid" })
  createdBy!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "promoted_at", type: "timestamptz", nullable: true })
  promotedAt!: Date | null;
}

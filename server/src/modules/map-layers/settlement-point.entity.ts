import type { Point } from "geojson";
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

/**
 * One named settlement (Backlog2 ERD `settlement_points`), from the GRID3 settlement-names set.
 * Rows only arrive through the map-layer loader script.
 */
@Entity("settlement_points")
export class SettlementPoint {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /**
   * The ward it sits in, found by matching the file's ward code to a live ward. Null when that
   * ward isn't loaded (or was cleared and re-imported): the point is still real, and the next
   * loader run links it again.
   */
  @Column({ name: "admin_unit_id", type: "uuid", nullable: true })
  adminUnitId!: string | null;

  /** GRID3's own settlement id (`set_id`). Unique, so loading a file twice adds nothing. */
  @Column({ name: "source_settlement_code", type: "varchar", length: 50 })
  sourceSettlementCode!: string;

  /** The ward code as written in the file, kept for traceability and for re-linking. */
  @Column({ name: "source_ward_code", type: "varchar", length: 100 })
  sourceWardCode!: string;

  @Column({ name: "settlement_name", type: "varchar", length: 200 })
  settlementName!: string;

  /** GRID3's "primary settlement" flag for a ward (its main community). */
  @Column({ name: "is_primary", type: "boolean", default: false })
  isPrimary!: boolean;

  /** Who GRID3 got this point from (OSGOF, OCHA, INEC polling units...), from the file's `source`. */
  @Column({ name: "data_origin", type: "varchar", length: 100, nullable: true })
  dataOrigin!: string | null;

  @Column({ type: "geometry", spatialFeatureType: "Point", srid: 4326, select: false })
  geom!: Point;

  @Column({ name: "source_id", type: "uuid" })
  sourceId!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

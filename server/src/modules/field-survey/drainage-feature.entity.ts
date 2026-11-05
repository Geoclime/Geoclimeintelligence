import type { LineString, Point } from "geojson";
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { DrainageCondition, DrainageKind, DrainMaterial, FlowDirection, RecordMethod } from "./survey-rules";

/**
 * One piece of drainage someone found on the ground (or a drainage plan listed): a drain walked as a
 * line, or a culvert, outfall, inlet or pond marked as a spot, with what condition it was in when last
 * looked at, and who looked. Each inspection is also kept in drain_inspections.
 */
@Entity("drainage_features")
export class DrainageFeature {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "country_code", type: "char", length: 3 })
  countryCode!: string;

  @Column({ name: "ward_id", type: "uuid", nullable: true })
  wardId!: string | null;

  @Column({ name: "lga_id", type: "uuid", nullable: true })
  lgaId!: string | null;

  @Column({ type: "varchar", length: 16 })
  kind!: DrainageKind;

  @Column({ type: "varchar", length: 14 })
  condition!: DrainageCondition;

  @Column({ type: "varchar", length: 120, nullable: true })
  name!: string | null;

  @Column({ type: "geometry", srid: 4326, select: false })
  geom!: Point | LineString;

  @Column({ name: "width_m", type: "double precision", nullable: true })
  widthM!: number | null;

  @Column({ name: "depth_m", type: "double precision", nullable: true })
  depthM!: number | null;

  @Column({ name: "length_m", type: "double precision", nullable: true })
  lengthM!: number | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  note!: string | null;

  @Column({ type: "varchar", length: 6 })
  method!: RecordMethod;

  /** Lines only: which way the water runs along the recorded points (migration AddDrainageDetails). */
  @Column({ name: "flow_direction", type: "varchar", length: 12, nullable: true })
  flowDirection!: FlowDirection | null;

  @Column({ name: "diameter_m", type: "double precision", nullable: true })
  diameterM!: number | null;

  @Column({ type: "varchar", length: 12, nullable: true })
  material!: DrainMaterial | null;

  @Column({ type: "smallint", nullable: true })
  barrels!: number | null;

  /** A drainage plan's own id for an imported drain, so loading the plan again adds nothing twice. */
  @Column({ name: "source_ref", type: "varchar", length: 100, nullable: true })
  sourceRef!: string | null;

  @Column({ name: "last_checked_at", type: "timestamptz", default: () => "now()" })
  lastCheckedAt!: Date;

  /** Who last looked at it (migration CreateAuditTrail). Staff-only to read. */
  @Column({ name: "last_checked_by", type: "uuid", nullable: true })
  lastCheckedBy!: string | null;

  @Column({ name: "recorded_by", type: "uuid", nullable: true })
  recordedBy!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

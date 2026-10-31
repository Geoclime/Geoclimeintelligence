import type { LineString, Point } from "geojson";
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { DrainageCondition, DrainageKind, SurveyMethod } from "./survey-rules";

/**
 * One piece of drainage someone found on the ground: a drain walked as a line, or a culvert, outfall,
 * inlet or pond marked as a spot, with what condition it was in when last looked at.
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
  method!: SurveyMethod;

  @Column({ name: "last_checked_at", type: "timestamptz", default: () => "now()" })
  lastCheckedAt!: Date;

  @Column({ name: "recorded_by", type: "uuid", nullable: true })
  recordedBy!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

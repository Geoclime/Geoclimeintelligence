import type { Point } from "geojson";
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { ReportStatus, WaterDepth } from "./flood-report.types";

/** What someone saw on the ground. Public only once a reviewer publishes it. */
@Entity("flood_reports")
export class FloodReport {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "reporter_id", type: "uuid", nullable: true })
  reporterId!: string | null;

  @Column({ type: "geometry", spatialFeatureType: "Point", srid: 4326, select: false })
  geom!: Point;

  @Column({ name: "location_name", type: "varchar", length: 200 })
  locationName!: string;

  /** The LGA and ward containing the point, found when the report arrives. */
  @Column({ name: "lga_id", type: "uuid", nullable: true })
  lgaId!: string | null;

  @Column({ name: "ward_id", type: "uuid", nullable: true })
  wardId!: string | null;

  @Column({ name: "water_depth", type: "varchar", length: 12 })
  waterDepth!: WaterDepth;

  @Column({ type: "text" })
  description!: string;

  @Column({ type: "varchar", length: 10, default: "pending" })
  status!: ReportStatus;

  @Column({ name: "review_note", type: "varchar", length: 500, nullable: true })
  reviewNote!: string | null;

  @Column({ name: "reviewed_by", type: "uuid", nullable: true })
  reviewedBy!: string | null;

  @Column({ name: "reviewed_at", type: "timestamptz", nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

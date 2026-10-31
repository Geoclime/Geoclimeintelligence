import type { MultiPolygon } from "geojson";
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { FloodDepth, SurveyMethod } from "./survey-rules";

/**
 * The reach of a flood as someone saw it on the ground: a shape walked with GPS, or drawn on the map,
 * with its area and perimeter measured in PostGIS. Written only by the flood-extents routes.
 */
@Entity("flood_extents")
export class FloodExtent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "country_code", type: "char", length: 3 })
  countryCode!: string;

  /** The ward at the middle of the shape; null when no loaded ward covers it. */
  @Column({ name: "ward_id", type: "uuid", nullable: true })
  wardId!: string | null;

  @Column({ name: "lga_id", type: "uuid", nullable: true })
  lgaId!: string | null;

  @Column({ type: "geometry", spatialFeatureType: "MultiPolygon", srid: 4326, select: false })
  geom!: MultiPolygon;

  @Column({ name: "area_m2", type: "double precision" })
  areaM2!: number;

  @Column({ name: "perimeter_m", type: "double precision" })
  perimeterM!: number;

  @Column({ type: "varchar", length: 6 })
  method!: SurveyMethod;

  @Column({ type: "varchar", length: 12, nullable: true })
  depth!: FloodDepth | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  note!: string | null;

  @Column({ name: "point_count", type: "integer" })
  pointCount!: number;

  @Column({ name: "accuracy_m", type: "real", nullable: true })
  accuracyM!: number | null;

  @Column({ name: "observed_at", type: "timestamptz", default: () => "now()" })
  observedAt!: Date;

  /** Set once the water has gone down: the shape stays as a record, and leaves the map after a week. */
  @Column({ name: "receded_at", type: "timestamptz", nullable: true })
  recededAt!: Date | null;

  @Column({ name: "recorded_by", type: "uuid", nullable: true })
  recordedBy!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

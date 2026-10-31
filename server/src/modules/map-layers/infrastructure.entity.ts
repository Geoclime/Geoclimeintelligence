import type { Point } from "geojson";
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { FacilityOrigin, FacilityType } from "./layer-rules";

/**
 * One facility (Backlog2 ERD `infrastructure`): a clinic, school, police station, market, ferry
 * terminal, water point... Most come from Geofabrik's OpenStreetMap extract through the map-layer
 * loader (`origin` 'import'); an administrator can also save one from the map (`origin` 'manual').
 */
@Entity("infrastructure")
export class Infrastructure {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "country_code", type: "char", length: 3 })
  countryCode!: string;

  /** The ward whose shape covers the point. Null when no live ward does; the next loader run links it. */
  @Column({ name: "admin_unit_id", type: "uuid", nullable: true })
  adminUnitId!: string | null;

  /** OpenStreetMap's id, as Geofabrik writes it. Unique together with `fromArea`. Null only for a place saved by hand. */
  @Column({ name: "osm_id", type: "varchar", length: 40, nullable: true })
  osmId!: string | null;

  /** Mapped in OSM as an outline (a hospital's grounds); `geom` is then a point inside it. */
  @Column({ name: "from_area", type: "boolean", default: false })
  fromArea!: boolean;

  @Column({ type: "varchar", length: 200, nullable: true })
  name!: string | null;

  /** The broad kind the map and analysis use: health, education, emergency... (layer-rules.ts). */
  @Column({ name: "facility_type", type: "varchar", length: 20 })
  facilityType!: FacilityType;

  /** Geofabrik's `fclass` as delivered: hospital, clinic, school, ferry_terminal... */
  @Column({ name: "osm_class", type: "varchar", length: 40 })
  osmClass!: string;

  @Column({ type: "geometry", spatialFeatureType: "Point", srid: 4326, select: false })
  geom!: Point;

  @Column({ name: "source_id", type: "uuid" })
  sourceId!: string;

  /** 'import' for a loader row, 'manual' for a place an administrator saved from the map. */
  @Column({ type: "varchar", length: 10, default: "import" })
  origin!: FacilityOrigin;

  /** What the administrator wrote about a place saved by hand. Always null for an imported row. */
  @Column({ type: "varchar", length: 500, nullable: true })
  note!: string | null;

  /** The administrator who saved the place. Null for an imported row, or once that user is deleted. */
  @Column({ name: "created_by", type: "uuid", nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

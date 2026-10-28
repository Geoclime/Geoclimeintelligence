import type { Point } from "geojson";
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { FacilityType } from "./layer-rules";

/**
 * One facility (Backlog2 ERD `infrastructure`): a clinic, school, police station, market, ferry
 * terminal, water point... from Geofabrik's OpenStreetMap extract. Rows only arrive through the
 * map-layer loader.
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

  /** OpenStreetMap's id, as Geofabrik writes it. Unique together with `fromArea`. */
  @Column({ name: "osm_id", type: "varchar", length: 40 })
  osmId!: string;

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

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

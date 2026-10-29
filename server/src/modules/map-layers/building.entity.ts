import type { MultiPolygon } from "geojson";
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

/**
 * One building outline (Backlog2 ERD `buildings`) from Geofabrik's OpenStreetMap extract. Rows
 * only arrive through the map-layer loader script.
 */
@Entity("buildings")
export class Building {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "country_code", type: "char", length: 3 })
  countryCode!: string;

  /** The ward covering a point inside the outline. Null when no live ward does; the next loader run links it. */
  @Column({ name: "admin_unit_id", type: "uuid", nullable: true })
  adminUnitId!: string | null;

  /** OpenStreetMap's id, as Geofabrik writes it. Unique. */
  @Column({ name: "osm_id", type: "varchar", length: 40 })
  osmId!: string;

  @Column({ type: "varchar", length: 200, nullable: true })
  name!: string | null;

  /** The OSM building tag when it says more than "yes": house, apartments, school, church... */
  @Column({ name: "building_type", type: "varchar", length: 40, nullable: true })
  buildingType!: string | null;

  @Column({ type: "geometry", spatialFeatureType: "MultiPolygon", srid: 4326, select: false })
  geom!: MultiPolygon;

  @Column({ name: "source_id", type: "uuid" })
  sourceId!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

import type { MultiLineString, MultiPolygon } from "geojson";
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

/**
 * One OpenStreetMap waterway (Backlog2 ERD `waterways`): a river or creek drawn as a line, or a
 * wide river or water body drawn as an area. Both live in this table, as the ERD says; the
 * shape's own type tells them apart. Rows only arrive through the map-layer loader script.
 */
@Entity("waterways")
export class Waterway {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "country_code", type: "char", length: 3 })
  countryCode!: string;

  /** OpenStreetMap's own id, e.g. "way/782839729" or "relation/18641509". Unique. */
  @Column({ name: "osm_id", type: "varchar", length: 40 })
  osmId!: string;

  @Column({ type: "varchar", length: 200, nullable: true })
  name!: string | null;

  /** The OSM `waterway` tag as delivered (stream, river, ditch, canal, drain). Null for areas. */
  @Column({ name: "waterway_type", type: "varchar", length: 40, nullable: true })
  waterwayType!: string | null;

  /** The OSM `water` tag on an area (lake, river, pond...). Null for lines. */
  @Column({ name: "water_tag", type: "varchar", length: 40, nullable: true })
  waterTag!: string | null;

  /**
   * river, creek or other. A rule applied by the data team to the OSM tags, not something OSM
   * states itself: class_basis says whether the tag or the feature's name decided it.
   */
  @Column({ name: "water_class", type: "varchar", length: 10 })
  waterClass!: string;

  @Column({ name: "class_basis", type: "varchar", length: 20 })
  classBasis!: string;

  @Column({ type: "varchar", length: 40, nullable: true })
  tunnel!: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  covered!: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  width!: string | null;

  /** Always MultiLineString or MultiPolygon, SRID 4326 (CHECK constraint). */
  @Column({ type: "geometry", srid: 4326, select: false })
  geom!: MultiLineString | MultiPolygon;

  @Column({ name: "source_id", type: "uuid" })
  sourceId!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

import type { MultiLineString } from "geojson";
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

/**
 * One OpenStreetMap road segment (Backlog2 ERD `roads`). Rows only arrive through the map-layer
 * loader script; every row points at the data source it came from (source_id NOT NULL).
 */
@Entity("roads")
export class Road {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "country_code", type: "char", length: 3 })
  countryCode!: string;

  /** OpenStreetMap's own id, e.g. "way/569669171". Unique, so loading a file twice adds nothing. */
  @Column({ name: "osm_id", type: "varchar", length: 40 })
  osmId!: string;

  @Column({ type: "varchar", length: 200, nullable: true })
  name!: string | null;

  /** The OSM `highway` tag as delivered: residential, primary, track... */
  @Column({ name: "road_class", type: "varchar", length: 40 })
  roadClass!: string;

  /** 1 (trunk) to 8 (minor), from layer-rules.ts. Decides which roads appear at which zoom. */
  @Column({ name: "class_rank", type: "smallint" })
  classRank!: number;

  @Column({ type: "varchar", length: 40, nullable: true })
  surface!: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  smoothness!: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  width!: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  lanes!: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  oneway!: string | null;

  @Column({ name: "is_bridge", type: "boolean", default: false })
  isBridge!: boolean;

  /** Always MultiLineString, SRID 4326. select: false so no ordinary find() drags shapes along. */
  @Column({ type: "geometry", spatialFeatureType: "MultiLineString", srid: 4326, select: false })
  geom!: MultiLineString;

  @Column({ name: "source_id", type: "uuid" })
  sourceId!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

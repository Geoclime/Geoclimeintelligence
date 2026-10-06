import type { MultiPolygon } from "geojson";
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

/**
 * A country and the names of its administrative levels, in order (Nigeria: State, LGA, Ward).
 * Created by an Administrator on the admin Countries page; never seeded.
 */
@Entity("countries")
export class Country {
  /** ISO 3166-1 alpha-3, e.g. NGA. The one natural key in the schema (Backlog2). */
  @PrimaryColumn({ name: "country_code", type: "char", length: 3 })
  countryCode!: string;

  @Column({ name: "country_name", type: "varchar", length: 100 })
  countryName!: string;

  /** Index 0 is level 1. admin_units.level_name copies these, kept in step by CountryRepository.update. */
  @Column({ name: "level_names", type: "text", array: true })
  levelNames!: string[];

  /** Optional rough box [minLon, minLat, maxLon, maxLat]; the import checks reject shapes outside it. */
  @Column({ type: "double precision", array: true, nullable: true })
  bbox!: number[] | null;

  /** Nullable until a country outline is loaded (Backlog2). Never selected by default. */
  @Column({ type: "geometry", spatialFeatureType: "MultiPolygon", srid: 4326, nullable: true, select: false })
  geom!: MultiPolygon | null;

  @Column({ name: "source_id", type: "uuid", nullable: true })
  sourceId!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

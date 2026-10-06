import type { MultiPolygon } from "geojson";
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

/**
 * One area in a country's hierarchy: a state, an LGA, a ward, or whatever a country's levels
 * are. Self-referencing through parent_id (Backlog2 ERD). Rows only ever arrive through the
 * import pipeline's promotion step.
 */
@Entity("admin_units")
export class AdminUnit {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "country_code", type: "char", length: 3 })
  countryCode!: string;

  /** null only at level 1, which hangs off the country directly (CHECK constraint). */
  @Column({ name: "parent_id", type: "uuid", nullable: true })
  parentId!: string | null;

  /** 1 = state, 2 = LGA, 3 = ward for Nigeria. */
  @Column({ type: "smallint" })
  level!: number;

  /** The country's own word for this level, copied from countries.level_names. */
  @Column({ name: "level_name", type: "varchar", length: 40 })
  levelName!: string;

  @Column({ name: "unit_name", type: "varchar", length: 200 })
  unitName!: string;

  /** The source's own code (e.g. a pcode or GRID3 wardcode). Not globally unique on its own. */
  @Column({ name: "unit_code", type: "varchar", length: 100, nullable: true })
  unitCode!: string | null;

  /**
   * Always MultiPolygon, SRID 4326. select: false so no ordinary find() ever drags shapes into a
   * list (section 10); shapes are read only by the repository's dedicated geometry queries.
   */
  @Column({ type: "geometry", spatialFeatureType: "MultiPolygon", srid: 4326, select: false })
  geom!: MultiPolygon;

  @Column({ name: "source_id", type: "uuid" })
  sourceId!: string;

  @Column({ name: "import_run_id", type: "uuid", nullable: true })
  importRunId!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

import { Column, Entity, PrimaryColumn } from "typeorm";
import type { UserRole } from "../../common/access/roles";

// Column types are always spelled out: tsx (esbuild) does not emit the decorator type
// metadata TypeORM would otherwise infer them from.

/** Lookup table of the five platform roles, seeded by the Phase 1 migration. */
@Entity("roles")
export class Role {
  @PrimaryColumn({ type: "varchar", length: 32 })
  code!: UserRole;

  @Column({ type: "varchar", length: 64 })
  name!: string;

  @Column({ type: "text" })
  description!: string;
}

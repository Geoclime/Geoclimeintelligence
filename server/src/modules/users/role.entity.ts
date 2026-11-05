import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

// Column types are always spelled out: tsx (esbuild) does not emit the decorator type
// metadata TypeORM would otherwise infer them from.

/**
 * A role: the five built-in ones seeded by the Phase 1 migration, and any an administrator created on
 * the Roles screen (migration CreateRolePermissions). What each may do is in `role_permissions`.
 */
@Entity("roles")
export class Role {
  @PrimaryColumn({ type: "varchar", length: 32 })
  code!: string;

  @Column({ type: "varchar", length: 64 })
  name!: string;

  @Column({ type: "text" })
  description!: string;

  @Column({ name: "is_system", type: "boolean", default: false })
  isSystem!: boolean;

  @Column({ name: "can_be_scoped", type: "boolean", default: false })
  canBeScoped!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

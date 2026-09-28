import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { UserRole } from "../../common/access/roles";

/**
 * A platform account. Firebase owns identity and passwords; this row owns what the account
 * may do: its role and optional region scope (section 7). There is no password column.
 */
@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "firebase_uid", type: "varchar", length: 128, unique: true })
  firebaseUid!: string;

  @Column({ type: "varchar", length: 320, nullable: true })
  email!: string | null;

  @Column({ name: "display_name", type: "varchar", length: 200, nullable: true })
  displayName!: string | null;

  /** FK to roles.code. */
  @Column({ type: "varchar", length: 32, default: "general_public" })
  role!: UserRole;

  /**
   * null = unrestricted. Only emergency_responder / government_official may be scoped
   * (CHECK constraint). Becomes a FK to admin_units.id in Phase 2.
   */
  @Column({ name: "scope_admin_unit_id", type: "uuid", nullable: true })
  scopeAdminUnitId!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

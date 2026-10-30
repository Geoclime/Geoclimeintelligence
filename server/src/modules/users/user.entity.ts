import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { RequestableRole, UserRole } from "../../common/access/roles";

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

  /** Self-service profile details (PATCH /api/v1/auth/me). Informational only: they grant nothing. */
  @Column({ type: "varchar", length: 32, nullable: true })
  phone!: string | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  organisation!: string | null;

  @Column({ name: "job_title", type: "varchar", length: 120, nullable: true })
  jobTitle!: string | null;

  /** FK to roles.code. */
  @Column({ type: "varchar", length: 32, default: "general_public" })
  role!: UserRole;

  /**
   * null = unrestricted. Only emergency_responder / government_official may be scoped
   * (CHECK constraint). Becomes a FK to admin_units.id in Phase 2.
   */
  @Column({ name: "scope_admin_unit_id", type: "uuid", nullable: true })
  scopeAdminUnitId!: string | null;

  /** An open request for a staff role, set by the user and resolved by an administrator. All three are null together. */
  @Column({ name: "requested_role", type: "varchar", length: 32, nullable: true })
  requestedRole!: RequestableRole | null;

  @Column({ name: "role_request_reason", type: "varchar", length: 500, nullable: true })
  roleRequestReason!: string | null;

  @Column({ name: "role_requested_at", type: "timestamptz", nullable: true })
  roleRequestedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

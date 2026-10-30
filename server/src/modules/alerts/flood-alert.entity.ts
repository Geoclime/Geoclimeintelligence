import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { AlertSeverity } from "./alert.types";

/** An official flood warning for one or more areas (flood_alert_areas). Issued through POST /api/v1/alerts. */
@Entity("flood_alerts")
export class FloodAlert {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 12 })
  severity!: AlertSeverity;

  @Column({ type: "varchar", length: 160 })
  title!: string;

  @Column({ type: "text" })
  message!: string;

  /** Recommended actions, one per line. */
  @Column({ type: "text", default: "" })
  actions!: string;

  @Column({ name: "starts_at", type: "timestamptz" })
  startsAt!: Date;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  /** Set when an issuer ends the alert before it expires. */
  @Column({ name: "ended_at", type: "timestamptz", nullable: true })
  endedAt!: Date | null;

  @Column({ name: "created_by", type: "uuid", nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";
import type { NotificationCategory } from "./notification.types";

/** One in-app notification for one person. Written by NotificationService only. */
@Entity("notifications")
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ type: "varchar", length: 20 })
  category!: NotificationCategory;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ type: "varchar", length: 1000 })
  body!: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  link!: string | null;

  @Column({ name: "read_at", type: "timestamptz", nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}

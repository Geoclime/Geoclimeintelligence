import { BaseRepository } from "../../common/repository/base.repository";
import type { PageMeta } from "../../common/response/api-response";
import { Notification } from "./notification.entity";
import type { Contact, INotificationRepository, NewNotification, NotificationCategory, NotificationDto, PreferenceDto } from "./notification.types";

const DTO_COLUMNS = `id, category, title, body, link,
  to_char(read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "readAt",
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"`;

/** Staff roles that review reports and watch alerts in their region. */
const STAFF = `('emergency_responder', 'government_official', 'administrator')`;

export class NotificationRepository extends BaseRepository<Notification> implements INotificationRepository {
  private static _instance?: NotificationRepository;
  static get Instance(): NotificationRepository {
    return (this._instance ??= new NotificationRepository());
  }

  protected readonly entity = Notification;

  async insertMany(rows: NewNotification[]): Promise<(NotificationDto & { userId: string })[]> {
    if (rows.length === 0) return [];
    return this.repo.query(
      `INSERT INTO notifications (user_id, category, title, body, link)
       SELECT * FROM unnest($1::uuid[], $2::varchar[], $3::varchar[], $4::varchar[], $5::varchar[])
       RETURNING user_id AS "userId", ${DTO_COLUMNS}`,
      [rows.map((r) => r.userId), rows.map((r) => r.category), rows.map((r) => r.title), rows.map((r) => r.body), rows.map((r) => r.link)],
    );
  }

  async findInbox(userId: string, { page, pageSize, unreadOnly }: { page: number; pageSize: number; unreadOnly: boolean }): Promise<{ items: NotificationDto[]; meta: PageMeta }> {
    const where = `WHERE user_id = $1 AND ($2::boolean = false OR read_at IS NULL)`;
    const [items, [count]] = await Promise.all([
      this.repo.query(`SELECT ${DTO_COLUMNS} FROM notifications ${where} ORDER BY created_at DESC, id LIMIT $3 OFFSET $4`, [userId, unreadOnly, pageSize, (page - 1) * pageSize]) as Promise<NotificationDto[]>,
      this.repo.query(`SELECT count(*)::int AS total FROM notifications ${where}`, [userId, unreadOnly]) as Promise<{ total: number }[]>,
    ]);
    return { items, meta: { page, pageSize, total: count?.total ?? 0 } };
  }

  async countUnread(userId: string): Promise<number> {
    const rows: { n: number }[] = await this.repo.query(`SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [userId]);
    return rows[0]?.n ?? 0;
  }

  async markRead(userId: string, id: string): Promise<boolean> {
    // A CTE, so the driver returns a plain row rather than UPDATE's [rows, count] pair.
    const rows: { n: number }[] = await this.repo.query(
      `WITH done AS (UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2 RETURNING id)
       SELECT count(*)::int AS n FROM done`,
      [id, userId],
    );
    return (rows[0]?.n ?? 0) > 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const rows: { n: number }[] = await this.repo.query(
      `WITH done AS (UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL RETURNING id)
       SELECT count(*)::int AS n FROM done`,
      [userId],
    );
    return rows[0]?.n ?? 0;
  }

  async findPreferences(userIds: string[], category: NotificationCategory): Promise<Map<string, Omit<PreferenceDto, "category">>> {
    const rows: (Omit<PreferenceDto, "category"> & { userId: string })[] = await this.repo.query(
      `SELECT user_id AS "userId", in_app AS "inApp", email, push FROM notification_preferences WHERE user_id = ANY($1::uuid[]) AND category = $2`,
      [userIds, category],
    );
    return new Map(rows.map(({ userId, ...preference }) => [userId, preference]));
  }

  findAllPreferences(userId: string): Promise<PreferenceDto[]> {
    return this.repo.query(`SELECT category, in_app AS "inApp", email, push FROM notification_preferences WHERE user_id = $1`, [userId]);
  }

  async savePreference(userId: string, { category, inApp, email, push }: PreferenceDto): Promise<void> {
    await this.repo.query(
      `INSERT INTO notification_preferences (user_id, category, in_app, email, push) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, category) DO UPDATE SET in_app = EXCLUDED.in_app, email = EXCLUDED.email, push = EXCLUDED.push, updated_at = now()`,
      [userId, category, inApp, email, push],
    );
  }

  async addPushToken(userId: string, token: string, userAgent: string | null): Promise<void> {
    // A token belongs to one browser; if someone else signs in on it, it moves to them.
    await this.repo.query(
      `INSERT INTO push_tokens (user_id, token, user_agent) VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, user_agent = EXCLUDED.user_agent, last_seen_at = now()`,
      [userId, token, userAgent],
    );
  }

  async removePushToken(userId: string, token: string): Promise<void> {
    await this.repo.query(`DELETE FROM push_tokens WHERE user_id = $1 AND token = $2`, [userId, token]);
  }

  async removePushTokens(tokens: string[]): Promise<void> {
    if (tokens.length > 0) await this.repo.query(`DELETE FROM push_tokens WHERE token = ANY($1::varchar[])`, [tokens]);
  }

  async findPushTokens(userIds: string[]): Promise<string[]> {
    const rows: { token: string }[] = await this.repo.query(`SELECT token FROM push_tokens WHERE user_id = ANY($1::uuid[])`, [userIds]);
    return rows.map((row) => row.token);
  }

  findContacts(userIds: string[]): Promise<Contact[]> {
    return this.repo.query(`SELECT id, email, display_name AS "displayName" FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
  }

  /**
   * People an alert for these LGAs reaches: everyone whose home is one of them, and staff whose
   * region overlaps them (the LGA itself, its state, or one of its wards) or who have no region.
   */
  async findAlertRecipients(lgaIds: string[], excludeUserId: string | null): Promise<string[]> {
    const rows: { id: string }[] = await this.repo.query(
      `WITH lgas AS (SELECT unnest($1::uuid[]) AS id),
            area AS (
              SELECT id FROM lgas
              UNION SELECT au.parent_id FROM admin_units au JOIN lgas ON au.id = lgas.id WHERE au.parent_id IS NOT NULL
              UNION SELECT au.id FROM admin_units au JOIN lgas ON au.parent_id = lgas.id)
       SELECT u.id FROM users u
        WHERE ($2::uuid IS NULL OR u.id <> $2)
          AND (u.home_admin_unit_id IN (SELECT id FROM lgas)
               OR (u.role IN ${STAFF} AND (u.scope_admin_unit_id IS NULL OR u.scope_admin_unit_id IN (SELECT id FROM area))))`,
      [lgaIds, excludeUserId],
    );
    return rows.map((row) => row.id);
  }

  /** Reviewers for a report in this LGA and ward: staff with no region, or a region containing it. */
  async findReviewers(lgaId: string | null, wardId: string | null, excludeUserId: string | null): Promise<string[]> {
    const rows: { id: string }[] = await this.repo.query(
      `SELECT u.id FROM users u
        WHERE u.role IN ${STAFF}
          AND ($3::uuid IS NULL OR u.id <> $3)
          AND (u.scope_admin_unit_id IS NULL
               OR u.scope_admin_unit_id IN ($1::uuid, $2::uuid, (SELECT parent_id FROM admin_units WHERE id = $1::uuid)))`,
      [lgaId, wardId, excludeUserId],
    );
    return rows.map((row) => row.id);
  }

  async findAdministrators(): Promise<string[]> {
    const rows: { id: string }[] = await this.repo.query(`SELECT id FROM users WHERE role = 'administrator'`);
    return rows.map((row) => row.id);
  }
}

import type { AuthUser } from "../../common/access/auth-user";
import { EmailOutbox, type IEmailOutbox } from "../../common/email/email-outbox";
import { notificationEmail } from "../../common/email/notification-email";
import { NotFoundError, ValidationError } from "../../common/errors/app-error";
import type { PageMeta } from "../../common/response/api-response";
import { FcmPushSender, type IPushSender } from "../../common/push/push-sender";
import { RealtimeGateway } from "../../common/realtime/realtime-gateway";
import { logger } from "../../config/logger";
import { NotificationRepository } from "./notification.repository";
import {
  CATEGORY_INFO,
  categoriesFor,
  type INotificationRepository,
  type NotificationCategory,
  type NotificationDto,
  type PreferenceDto,
} from "./notification.types";
import type { ListNotificationsQuery } from "./notification.validation";

/** One event to tell people about. */
export interface Notice {
  userIds: string[];
  category: NotificationCategory;
  title: string;
  body: string;
  /** A path in the app, e.g. "/alerts". */
  link: string;
  /** Push marked urgent (a flood warning): delivered at once even to a sleeping phone. */
  urgent?: boolean;
}

export interface PreferencesDto {
  categories: (PreferenceDto & { label: string })[];
  /** Which channels the platform can send on at all (email and push need configuring). */
  channels: { inApp: boolean; email: boolean; push: boolean };
}

const ALL_ON = { inApp: true, email: true, push: true };

/**
 * Notifications: one event reaches each person on the channels they chose for its category
 * (everything is on until they change it):
 *   - in-app: saved to their inbox and sent live to any open tab (Socket.IO);
 *   - email:  queued in the outbox and sent by its worker (common/email/email-outbox.ts);
 *   - push:   sent through Firebase Cloud Messaging to every browser or app they allowed.
 * Sending never throws to the caller: a failed channel is logged and the others still go.
 */
export class NotificationService {
  private static _instance?: NotificationService;
  static get Instance(): NotificationService {
    return (this._instance ??= new NotificationService(NotificationRepository.Instance, RealtimeGateway.Instance, EmailOutbox.Instance, FcmPushSender.Instance));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly notifications: INotificationRepository,
    private readonly realtime: Pick<RealtimeGateway, "emitToUser">,
    private readonly email: IEmailOutbox,
    private readonly push: IPushSender,
  ) {}

  async notify(notice: Notice): Promise<void> {
    const userIds = [...new Set(notice.userIds)];
    if (userIds.length === 0) return;
    const saved = await this.notifications.findPreferences(userIds, notice.category);
    const wants = (channel: keyof typeof ALL_ON) => userIds.filter((id) => (saved.get(id) ?? ALL_ON)[channel]);

    await Promise.all([this.sendInApp(wants("inApp"), notice), this.sendEmail(wants("email"), notice), this.sendPush(wants("push"), notice)]);
  }

  async list(user: AuthUser, query: ListNotificationsQuery): Promise<{ items: NotificationDto[]; unreadCount: number; meta: PageMeta }> {
    const [{ items, meta }, unreadCount] = await Promise.all([
      this.notifications.findInbox(user.id, { page: query.page, pageSize: query.pageSize, unreadOnly: query.unread }),
      this.notifications.countUnread(user.id),
    ]);
    return { items, unreadCount, meta };
  }

  unreadCount(user: AuthUser): Promise<number> {
    return this.notifications.countUnread(user.id);
  }

  async markRead(user: AuthUser, id: string): Promise<number> {
    if (!(await this.notifications.markRead(user.id, id))) throw new NotFoundError("Notification");
    return this.notifications.countUnread(user.id);
  }

  async markAllRead(user: AuthUser): Promise<number> {
    await this.notifications.markAllRead(user.id);
    return 0;
  }

  /** The categories this person can receive, each with its channels (saved, or all on). */
  async preferences(user: AuthUser): Promise<PreferencesDto> {
    const saved = new Map((await this.notifications.findAllPreferences(user.id)).map((p) => [p.category, p]));
    return {
      categories: categoriesFor(user.role).map((category) => ({ ...ALL_ON, ...saved.get(category), category, label: CATEGORY_INFO[category].label })),
      channels: { inApp: true, email: this.email.enabled, push: this.push.enabled },
    };
  }

  async savePreference(user: AuthUser, preference: PreferenceDto): Promise<PreferencesDto> {
    if (!categoriesFor(user.role).includes(preference.category)) {
      throw new ValidationError([{ field: "category", message: "This kind of notification doesn't apply to your role" }]);
    }
    await this.notifications.savePreference(user.id, preference);
    return this.preferences(user);
  }

  addPushToken(user: AuthUser, token: string, userAgent: string | null): Promise<void> {
    return this.notifications.addPushToken(user.id, token, userAgent);
  }

  removePushToken(user: AuthUser, token: string): Promise<void> {
    return this.notifications.removePushToken(user.id, token);
  }

  private async sendInApp(userIds: string[], notice: Notice): Promise<void> {
    if (userIds.length === 0) return;
    try {
      const rows = await this.notifications.insertMany(
        userIds.map((userId) => ({ userId, category: notice.category, title: notice.title, body: notice.body, link: notice.link })),
      );
      for (const { userId, ...notification } of rows) this.realtime.emitToUser(userId, "notification:new", notification);
    } catch (err) {
      logger.error({ err, category: notice.category }, "In-app notifications failed");
    }
  }

  private async sendEmail(userIds: string[], notice: Notice): Promise<void> {
    if (userIds.length === 0 || !this.email.enabled) return;
    try {
      const contacts = await this.notifications.findContacts(userIds);
      const reason = CATEGORY_INFO[notice.category].reason;
      await this.email.enqueue(
        contacts
          .filter((c): c is typeof c & { email: string } => Boolean(c.email))
          .map((c) => notificationEmail({ to: c.email, name: c.displayName, title: notice.title, body: notice.body, link: notice.link, reason })),
      );
    } catch (err) {
      logger.error({ err, category: notice.category }, "Queueing notification emails failed");
    }
  }

  private async sendPush(userIds: string[], notice: Notice): Promise<void> {
    if (userIds.length === 0 || !this.push.enabled) return;
    try {
      const tokens = await this.notifications.findPushTokens(userIds);
      const dead = await this.push.send(tokens, { title: notice.title, body: notice.body, link: notice.link, tag: notice.category, urgent: notice.urgent ?? false });
      await this.notifications.removePushTokens(dead);
    } catch (err) {
      logger.error({ err, category: notice.category }, "Push notifications failed");
    }
  }
}

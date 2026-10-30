import { describe, expect, it } from "vitest";
import type { AuthUser } from "../../src/common/access/auth-user";
import type { EmailMessage } from "../../src/common/email/mailer";
import type { IEmailOutbox } from "../../src/common/email/email-outbox";
import { ValidationError } from "../../src/common/errors/app-error";
import type { IPushSender, PushMessage } from "../../src/common/push/push-sender";
import { AuthService } from "../../src/modules/auth/auth.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import type { INotificationRepository, NewNotification, NotificationCategory, PreferenceDto } from "../../src/modules/notifications/notification.types";
import { isProfileComplete } from "../../src/modules/users/user.types";
import { asAuthUser, FakeTokenVerifier, InMemoryUserRepository, makeUser } from "../fakes";
import { InMemoryAdminUnitRepository, makeUnit } from "../geo-fakes";

const ADA = "00000000-0000-4000-8000-0000000000a1";
const BAYO = "00000000-0000-4000-8000-0000000000b2";

/** Only what the service touches; the SQL itself is checked against PostGIS, not faked. */
class FakeNotifications implements Partial<INotificationRepository> {
  saved: NewNotification[] = [];
  preferences = new Map<string, Map<NotificationCategory, Omit<PreferenceDto, "category">>>();
  tokens = new Map<string, string[]>();
  removed: string[] = [];
  failInsert = false;

  async insertMany(rows: NewNotification[]) {
    if (this.failInsert) throw new Error("database down");
    this.saved.push(...rows);
    return rows.map((row, i) => ({ id: `n${i}`, userId: row.userId, category: row.category, title: row.title, body: row.body, link: row.link, readAt: null, createdAt: "2026-10-30T09:00:00.000Z" }));
  }
  async findPreferences(userIds: string[], category: NotificationCategory) {
    return new Map(userIds.flatMap((id) => (this.preferences.get(id)?.get(category) ? [[id, this.preferences.get(id)!.get(category)!] as const] : [])));
  }
  async findAllPreferences(userId: string) {
    return [...(this.preferences.get(userId) ?? new Map()).entries()].map(([category, p]) => ({ category, ...p }));
  }
  async savePreference(userId: string, { category, ...p }: PreferenceDto) {
    this.preferences.set(userId, (this.preferences.get(userId) ?? new Map()).set(category, p));
  }
  async findContacts(userIds: string[]) {
    return userIds.map((id) => ({ id, email: `${id.slice(-2)}@example.test`, displayName: id === ADA ? "Ada Obi" : null }));
  }
  async findPushTokens(userIds: string[]) {
    return userIds.flatMap((id) => this.tokens.get(id) ?? []);
  }
  async removePushTokens(tokens: string[]) {
    this.removed.push(...tokens);
  }
}

function setup({ emailOn = true, pushOn = true } = {}) {
  const repo = new FakeNotifications();
  const live: { userId: string; event: string }[] = [];
  const emails: EmailMessage[] = [];
  const pushes: { tokens: string[]; message: PushMessage }[] = [];
  const outbox: IEmailOutbox = { enabled: emailOn, enqueue: async (messages) => void emails.push(...messages) };
  const push: IPushSender = {
    enabled: pushOn,
    send: async (tokens, message) => {
      pushes.push({ tokens, message });
      return tokens.filter((t) => t.startsWith("dead"));
    },
  };
  const service = new NotificationService(repo as unknown as INotificationRepository, { emitToUser: (userId, event) => void live.push({ userId, event }) }, outbox, push);
  return { service, repo, live, emails, pushes };
}

const notice = { userIds: [ADA, BAYO], category: "flood_alerts" as const, title: "Flood warning: River Bonny rising", body: "Port Harcourt LGA. Water rising.", link: "/alerts", urgent: true };

describe("NotificationService.notify", () => {
  it("reaches everyone on every channel until they change their settings", async () => {
    const { service, repo, live, emails, pushes } = setup();
    repo.tokens.set(ADA, ["ada-phone"]);
    await service.notify(notice);
    expect(repo.saved.map((n) => n.userId)).toEqual([ADA, BAYO]);
    expect(live).toEqual([{ userId: ADA, event: "notification:new" }, { userId: BAYO, event: "notification:new" }]);
    expect(emails.map((e) => e.to)).toEqual(["a1@example.test", "b2@example.test"]);
    expect(emails[0]!.html).toContain("Hello Ada Obi");
    expect(pushes[0]).toMatchObject({ tokens: ["ada-phone"], message: { tag: "flood_alerts", urgent: true, link: "/alerts" } });
  });

  it("follows each person's own channels for the category", async () => {
    const { service, repo, emails } = setup();
    await repo.savePreference(BAYO, { category: "flood_alerts", inApp: false, email: false, push: true });
    await service.notify(notice);
    expect(repo.saved.map((n) => n.userId)).toEqual([ADA]);
    expect(emails.map((e) => e.to)).toEqual(["a1@example.test"]);
  });

  it("deletes push tokens FCM says are dead", async () => {
    const { service, repo } = setup();
    repo.tokens.set(ADA, ["ada-phone", "dead-old-laptop"]);
    await service.notify(notice);
    expect(repo.removed).toEqual(["dead-old-laptop"]);
  });

  it("still emails and pushes when the in-app channel fails, and never throws", async () => {
    const { service, repo, emails } = setup();
    repo.failInsert = true;
    await expect(service.notify(notice)).resolves.toBeUndefined();
    expect(emails).toHaveLength(2);
  });

  it("skips email and push when they aren't set up", async () => {
    const { service, emails, pushes, repo } = setup({ emailOn: false, pushOn: false });
    repo.tokens.set(ADA, ["ada-phone"]);
    await service.notify(notice);
    expect(emails).toHaveLength(0);
    expect(pushes).toHaveLength(0);
  });
});

describe("NotificationService preferences", () => {
  const member: AuthUser = { id: ADA, firebaseUid: "a", email: null, displayName: "Ada", role: "general_public", scopeAdminUnitId: null, profileComplete: true };
  const responder: AuthUser = { ...member, id: BAYO, role: "emergency_responder" };

  it("lists only the categories that apply to the role, everything on by default", async () => {
    const { service } = setup({ pushOn: false });
    const forMember = await service.preferences(member);
    expect(forMember.categories.map((c) => c.category)).toEqual(["flood_alerts", "my_reports", "account"]);
    expect(forMember.categories.every((c) => c.inApp && c.email && c.push)).toBe(true);
    expect(forMember.channels).toEqual({ inApp: true, email: true, push: false });
    expect((await service.preferences(responder)).categories.map((c) => c.category)).toContain("review_queue");
  });

  it("refuses a category the role doesn't get", async () => {
    const { service } = setup();
    await expect(service.savePreference(member, { category: "review_queue", inApp: false, email: false, push: false })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("profile set-up", () => {
  const rivers = makeUnit({ level: 1, levelName: "State", unitName: "Rivers" });
  const obio = makeUnit({ level: 2, levelName: "LGA", unitName: "Obio/Akpor", parentId: rivers.id });

  it("is complete with a name, a phone number and a home LGA", () => {
    expect(isProfileComplete({ displayName: "Ada Obi", phone: "+234 803 123 4567", homeAdminUnitId: obio.id })).toBe(true);
    expect(isProfileComplete({ displayName: "Ada Obi", phone: null, homeAdminUnitId: obio.id })).toBe(false);
    expect(isProfileComplete({ displayName: " ", phone: "0803", homeAdminUnitId: obio.id })).toBe(false);
  });

  function auth() {
    const user = makeUser({ displayName: "Ada Obi" });
    const repo = new InMemoryUserRepository([user]);
    return { user, service: new AuthService(repo, new FakeTokenVerifier(), "", new InMemoryAdminUnitRepository([rivers, obio])) };
  }

  it("saves the details and reports the profile complete", async () => {
    const { user, service } = auth();
    const profile = await service.updateProfile(asAuthUser(user), { phone: "+234 803 123 4567", homeAdminUnitId: obio.id });
    expect(profile).toMatchObject({ homeAdminUnitId: obio.id, profileComplete: true });
  });

  it("refuses a state as a home area, and clearing a required detail", async () => {
    const { user, service } = auth();
    await expect(service.updateProfile(asAuthUser(user), { homeAdminUnitId: rivers.id })).rejects.toBeInstanceOf(ValidationError);
    await expect(service.updateProfile(asAuthUser(user), { phone: null })).rejects.toBeInstanceOf(ValidationError);
    await expect(service.updateProfile(asAuthUser(user), { displayName: "A" })).rejects.toBeInstanceOf(ValidationError);
  });
});

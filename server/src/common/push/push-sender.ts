import { getMessaging } from "firebase-admin/messaging";
import { canSendPush, getFirebaseApp } from "../../config/firebase";

export interface PushMessage {
  title: string;
  body: string;
  /** A path in the app the notification opens, e.g. "/alerts". */
  link: string;
  /** Notifications with the same tag replace each other on the device (one per category). */
  tag: string;
  urgent: boolean;
}

/** Sends push notifications. Services depend on this, so tests use an in-memory fake. */
export interface IPushSender {
  /** False when no Firebase service account is configured. */
  readonly enabled: boolean;
  /** Sends to every token; resolves with the tokens FCM says are no longer valid (to delete). */
  send(tokens: string[], message: PushMessage): Promise<string[]>;
}

/** Errors meaning the token will never work again: the app was uninstalled or permission withdrawn. */
const DEAD_TOKEN_CODES = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"]);

/**
 * Push through Firebase Cloud Messaging. Messages are data-only: the app's service worker
 * (client/public/sw.js) shows them, so they look the same everywhere and are not shown twice
 * while the app is open (the in-app notification covers that).
 */
export class FcmPushSender implements IPushSender {
  private static _instance?: FcmPushSender;
  static get Instance(): FcmPushSender {
    return (this._instance ??= new FcmPushSender());
  }

  readonly enabled = canSendPush;

  async send(tokens: string[], message: PushMessage): Promise<string[]> {
    if (!this.enabled || tokens.length === 0) return [];
    const dead: string[] = [];
    // FCM takes at most 500 tokens per call.
    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      const result = await getMessaging(getFirebaseApp()).sendEachForMulticast({
        tokens: batch,
        data: { title: message.title, body: message.body, link: message.link, tag: message.tag },
        webpush: { headers: { Urgency: message.urgent ? "high" : "normal", TTL: String(message.urgent ? 6 * 3600 : 24 * 3600) } },
      });
      result.responses.forEach((response, index) => {
        if (!response.success && response.error && DEAD_TOKEN_CODES.has(response.error.code)) dead.push(batch[index]!);
      });
    }
    return dead;
  }
}

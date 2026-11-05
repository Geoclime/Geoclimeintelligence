import { getApps } from "firebase/app";
import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { env, IS_E2E } from "../config/env";

/**
 * The only file in the client that talks to Firebase Cloud Messaging. It turns this browser's
 * push permission into a registration token for the server to send to. The notifications
 * themselves are shown by the app's own service worker (public/sw.js).
 *
 * Push needs: a production build (the service worker isn't registered in development), the
 * Firebase sender ID and web-push key (VITE_FIREBASE_MESSAGING_SENDER_ID / _VAPID_KEY), and a
 * browser that supports it. iPhones only allow it once the app is added to the Home Screen.
 */

export type PushAvailability = "available" | "unsupported" | "not-configured";

export async function pushAvailability(): Promise<PushAvailability> {
  if (IS_E2E || !import.meta.env.PROD) return "not-configured";
  if (!env.VITE_FIREBASE_VAPID_KEY || !env.VITE_FIREBASE_MESSAGING_SENDER_ID || getApps().length === 0) return "not-configured";
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return "unsupported";
  return (await isSupported().catch(() => false)) ? "available" : "unsupported";
}

/** "granted", "denied" or "default" (not asked yet); "denied" can only be undone in browser settings. */
export function pushPermission(): NotificationPermission {
  return "Notification" in window ? Notification.permission : "denied";
}

async function tokenFor(registration: ServiceWorkerRegistration): Promise<string | null> {
  return getToken(getMessaging(getApps()[0]!), { vapidKey: env.VITE_FIREBASE_VAPID_KEY, serviceWorkerRegistration: registration });
}

/** Asks for permission (the browser's own prompt; call it from a button press) and returns this device's token. */
export async function requestPushToken(): Promise<string | null> {
  if ((await pushAvailability()) !== "available") return null;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  return tokenFor(await navigator.serviceWorker.ready);
}

/** This device's token, only when permission was already given (never prompts). */
export async function currentPushToken(): Promise<string | null> {
  if ((await pushAvailability()) !== "available" || pushPermission() !== "granted") return null;
  return tokenFor(await navigator.serviceWorker.ready).catch(() => null);
}

/** Stops push on this device (the token stops working). */
export async function deletePushToken(): Promise<void> {
  if ((await pushAvailability()) !== "available") return;
  await deleteToken(getMessaging(getApps()[0]!)).catch(() => undefined);
}

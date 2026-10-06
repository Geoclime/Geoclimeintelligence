import type { ActionCodeSettings } from "firebase/auth";

/**
 * Where the "Continue" button on Firebase's hosted action page sends the user after they click
 * the link in a verification or password-reset email.
 */
export const CONTINUE_PATHS = {
  // Unverified accounts can't use the app, so the next step after verifying is signing in.
  verifyEmail: "/sign-in",
  resetPassword: "/sign-in",
} as const;

/**
 * Settings that give an account email a way back into this app. The link is still handled on
 * Firebase's page (handleCodeInApp: false); `url` only becomes that page's Continue button.
 * The origin is this deployment's own, so local, preview and production each link to themselves.
 */
export function continueSettings(path: string, origin: string = window.location.origin): ActionCodeSettings {
  return { url: new URL(path, origin).toString(), handleCodeInApp: false };
}

// Firebase refuses a continue URL whose domain isn't in Authentication > Settings > Authorized
// domains (e.g. a new Vercel preview URL).
const CONTINUE_URL_REJECTIONS = new Set([
  "auth/unauthorized-continue-uri",
  "auth/invalid-continue-uri",
  "auth/missing-continue-uri",
]);

/**
 * Sends an account email with a continue URL. If Firebase rejects only the URL, sends it again
 * without one: a plain email beats no email at all.
 */
export async function sendWithContinueUrl(
  send: (settings?: ActionCodeSettings) => Promise<void>,
  settings: ActionCodeSettings,
): Promise<void> {
  try {
    await send(settings);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code !== "string" || !CONTINUE_URL_REJECTIONS.has(code)) throw error;
    await send();
  }
}

import type { RoleRequestBody } from "../types/auth.types";

/**
 * A role asked for on the sign-up form, kept until the new account first signs in. A new account
 * isn't signed in until its email is verified, so the request can't reach the server at sign-up;
 * it is sent right after the first sign-in instead (hooks/useSubmitPendingRoleRequest.ts).
 *
 * It lives in this browser only, keyed by email, and expires after 30 days. If the person verifies
 * on another device, they can still make the request from their profile page.
 */
const KEY = "geoclime:pending-role-request";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface Stored {
  email: string;
  savedAt: number;
  request: RoleRequestBody;
}

export function savePendingRoleRequest(email: string, request: RoleRequestBody, now = Date.now()): void {
  try {
    const stored: Stored = { email: email.trim().toLowerCase(), savedAt: now, request };
    window.localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Storage blocked (private mode): the profile page still offers the request.
  }
}

/** The saved request for this email, removed as it is read. Null if none, another email's, or expired. */
export function takePendingRoleRequest(email: string, now = Date.now()): RoleRequestBody | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Stored;
    if (stored.email !== email.trim().toLowerCase()) return null;
    window.localStorage.removeItem(KEY);
    return now - stored.savedAt <= MAX_AGE_MS ? stored.request : null;
  } catch {
    return null;
  }
}

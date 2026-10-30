import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchCurrentUser, submitRoleRequest, updateCurrentUser, withdrawRoleRequest } from "../endpoints/auth.endpoints";
import { unregisterPushToken } from "../endpoints/notification.endpoints";
import { toApiError } from "../transport/api-error";
import { currentPushToken, deletePushToken } from "../transport/push-messaging";
import { identity } from "../transport/identity";
import type { AuthUser, IdentitySession, ProfilePatch, RoleRequestBody } from "../types/auth.types";

/**
 * - loading:    working out who is signed in (session restore, or waiting for /auth/me)
 * - signed-out: no Firebase session on this device (an account with an unverified email counts)
 * - signed-in:  Firebase session AND the backend's user record (role, scope) are both known
 * - error:      signed in with Firebase, but the backend couldn't be reached to resolve the role
 */
export type AuthStatus = "loading" | "signed-out" | "signed-in" | "error";

interface AuthState {
  status: AuthStatus;
  session: IdentitySession | null;
  user: AuthUser | null;
  error: string | null;
}

export interface AuthContextValue extends AuthState {
  /** Re-asks the backend for the user record after an `error` status. */
  retry: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  /** Creates the account and emails a link; the new account is NOT signed in until it's verified. */
  signUp: (email: string, password: string, displayName?: string) => Promise<{ verificationSent: boolean }>;
  /** Saves the signed-in user's own profile details and swaps in the updated record. */
  updateProfile: (patch: ProfilePatch) => Promise<AuthUser>;
  /** Asks an administrator for a staff role (it grants nothing until approved) and swaps in the updated record. */
  requestRole: (body: RoleRequestBody) => Promise<AuthUser>;
  /** Withdraws the open role request and swaps in the updated record. */
  withdrawRoleRequest: () => Promise<AuthUser>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerificationEmail: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const INITIAL: AuthState = { status: "loading", session: null, user: null, error: null };

/**
 * Wraps the identity provider; it doesn't replace it (standard section 12). Firebase says WHO
 * the person is. On every session change (sign-in, sign-out, hourly token refresh) this asks the
 * backend WHAT they may do: role and region scope live in Postgres, not in the token, so the
 * token is never decoded client-side.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL);
  const latestSession = useRef<IdentitySession | null>(null);
  // Only the newest /auth/me response may update state; an older one finishing late is ignored.
  const requestId = useRef(0);

  const resolveUser = useCallback(async (session: IdentitySession | null) => {
    const thisRequest = ++requestId.current;
    if (!session) {
      setState({ status: "signed-out", session: null, user: null, error: null });
      return;
    }

    // Token refresh for the same account: keep showing the current user while re-checking.
    setState((prev) =>
      prev.user && prev.session?.uid === session.uid
        ? { ...prev, session }
        : { status: "loading", session, user: null, error: null },
    );

    try {
      const { data } = await fetchCurrentUser();
      if (thisRequest !== requestId.current) return;
      if (!data) throw new Error("The server returned no user record.");
      setState({ status: "signed-in", session, user: data, error: null });
    } catch (error) {
      if (thisRequest !== requestId.current) return;
      const apiError = toApiError(error);
      if (apiError.isUnauthorized) {
        // The transport already forced one token refresh and it still failed: the Firebase
        // session itself is no longer valid. Signing out fires the listener with null.
        await identity.signOut().catch(() => undefined);
        return;
      }
      // A transient failure during a background refresh keeps the user signed in as they were.
      setState((prev) =>
        prev.user && prev.session?.uid === session.uid
          ? prev
          : { status: "error", session, user: null, error: apiError.message },
      );
    }
  }, []);

  useEffect(
    () =>
      identity.onSessionChanged((session) => {
        latestSession.current = session;
        void resolveUser(session);
      }),
    [resolveUser],
  );

  const retry = useCallback(() => void resolveUser(latestSession.current), [resolveUser]);

  /** Runs a call that returns the user's own updated record, and swaps it in. */
  const saveOwnRecord = useCallback(async (call: () => Promise<{ data: AuthUser | null }>) => {
    const { data } = await call();
    if (!data) throw new Error("The server returned no user record.");
    setState((prev) => (prev.user?.id === data.id ? { ...prev, user: data } : prev));
    return data;
  }, []);

  const updateProfile = useCallback((patch: ProfilePatch) => saveOwnRecord(() => updateCurrentUser(patch)), [saveOwnRecord]);
  const requestRole = useCallback((body: RoleRequestBody) => saveOwnRecord(() => submitRoleRequest(body)), [saveOwnRecord]);
  const withdrawRole = useCallback(() => saveOwnRecord(withdrawRoleRequest), [saveOwnRecord]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      retry,
      signIn: (email, password) => identity.signIn(email, password),
      signUp: (email, password, displayName) => identity.signUp(email, password, displayName),
      updateProfile,
      requestRole,
      withdrawRoleRequest: withdrawRole,
      sendPasswordReset: (email) => identity.sendPasswordReset(email),
      resendVerificationEmail: (email, password) => identity.resendVerificationEmail(email, password),
      signOut: async () => {
        // Stop push on this device first (it needs the session), so a shared computer doesn't keep
        // receiving the last person's alerts. Best effort: signing out never waits on it failing.
        const token = await currentPushToken().catch(() => null);
        if (token) await unregisterPushToken(token).catch(() => undefined);
        await deletePushToken();
        await identity.signOut();
      },
    }),
    [state, retry, updateProfile, requestRole, withdrawRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

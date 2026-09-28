/**
 * Errors from sign-in, sign-up and password reset, with a message that is safe to show the user.
 * Firebase's raw messages ("Firebase: Error (auth/invalid-credential).") never reach the screen.
 */
export class IdentityError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "IdentityError";
  }
}

// Firebase Auth error codes: https://firebase.google.com/docs/reference/js/auth#autherrorcodes
// Wrong email and wrong password deliberately share one message (and Firebase's email
// enumeration protection already merges them into auth/invalid-credential), so the form never
// reveals whether an account exists.
const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "That email and password don't match an account.",
  "auth/invalid-login-credentials": "That email and password don't match an account.",
  "auth/wrong-password": "That email and password don't match an account.",
  "auth/user-not-found": "That email and password don't match an account.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/user-disabled": "This account has been disabled. Contact an administrator.",
  "auth/email-already-in-use": "An account with this email already exists. Try signing in instead.",
  "auth/weak-password": "Choose a stronger password.",
  "auth/password-does-not-meet-requirements": "That password doesn't meet the requirements.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes, then try again.",
  "auth/network-request-failed": "We couldn't reach the sign-in service. Check your connection.",
  "auth/operation-not-allowed": "Email sign-in isn't enabled for this project yet.",
  "auth/requires-recent-login": "For your security, sign in again before doing that.",
};

export function identityErrorFromCode(code: string): IdentityError {
  return new IdentityError(code, MESSAGES[code] ?? "Something went wrong. Please try again.");
}

/** Accepts anything a Firebase Auth call rejects with and returns an IdentityError. */
export function toIdentityError(error: unknown): IdentityError {
  if (error instanceof IdentityError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  return identityErrorFromCode(typeof code === "string" ? code : "unknown");
}

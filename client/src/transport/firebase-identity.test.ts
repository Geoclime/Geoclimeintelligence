import type { User } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_NOT_VERIFIED, IdentityError } from "./identity-error";

// The Firebase SDK is replaced with spies, so these tests check what OUR wrapper decides to do
// with it: when it signs out, what it reports as a session, and when it refuses.
const firebase = vi.hoisted(() => ({
  auth: { languageCode: "" },
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
  signOut: vi.fn(),
  onIdTokenChanged: vi.fn(),
}));

vi.mock("firebase/app", () => ({ initializeApp: vi.fn() }));
vi.mock("firebase/auth", () => ({
  getAuth: () => firebase.auth,
  createUserWithEmailAndPassword: firebase.createUserWithEmailAndPassword,
  signInWithEmailAndPassword: firebase.signInWithEmailAndPassword,
  sendEmailVerification: firebase.sendEmailVerification,
  sendPasswordResetEmail: vi.fn(),
  signOut: firebase.signOut,
  onIdTokenChanged: firebase.onIdTokenChanged,
}));
vi.mock("../config/env", () => ({ env: {} }));

const { createFirebaseIdentity } = await import("./firebase-identity");

const user = (emailVerified: boolean) =>
  ({ uid: "uid-1", email: "ada@example.com", emailVerified }) as unknown as User;

/** Records the order Firebase calls happen in. */
function trackOrder() {
  const calls: string[] = [];
  firebase.sendEmailVerification.mockImplementation(async () => void calls.push("send"));
  firebase.signOut.mockImplementation(async () => void calls.push("signOut"));
  return calls;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("window", { location: { origin: "https://app.example.com" } });
  firebase.signOut.mockResolvedValue(undefined);
  firebase.sendEmailVerification.mockResolvedValue(undefined);
});

describe("signUp", () => {
  it("emails the verification link, then signs the new account straight back out", async () => {
    firebase.createUserWithEmailAndPassword.mockResolvedValue({ user: user(false) });
    const calls = trackOrder();

    await expect(createFirebaseIdentity().signUp("ada@example.com", "pw")).resolves.toEqual({
      verificationSent: true,
    });
    expect(calls).toEqual(["send", "signOut"]);
  });

  it("still signs out, and reports it, when the verification email can't be sent", async () => {
    firebase.createUserWithEmailAndPassword.mockResolvedValue({ user: user(false) });
    firebase.sendEmailVerification.mockRejectedValue({ code: "auth/too-many-requests" });

    await expect(createFirebaseIdentity().signUp("ada@example.com", "pw")).resolves.toEqual({
      verificationSent: false,
    });
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
  });

  it("rejects with a friendly error, and signs nobody out, when the account can't be created", async () => {
    firebase.createUserWithEmailAndPassword.mockRejectedValue({ code: "auth/email-already-in-use" });

    const failure = await createFirebaseIdentity()
      .signUp("ada@example.com", "pw")
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(IdentityError);
    expect((failure as IdentityError).code).toBe("auth/email-already-in-use");
    expect(firebase.signOut).not.toHaveBeenCalled();
  });
});

describe("signIn", () => {
  it("signs out and refuses when the password is right but the email isn't verified", async () => {
    firebase.signInWithEmailAndPassword.mockResolvedValue({ user: user(false) });

    const failure = await createFirebaseIdentity()
      .signIn("ada@example.com", "pw")
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(IdentityError);
    expect((failure as IdentityError).code).toBe(EMAIL_NOT_VERIFIED);
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
  });

  it("leaves a verified account signed in", async () => {
    firebase.signInWithEmailAndPassword.mockResolvedValue({ user: user(true) });

    await createFirebaseIdentity().signIn("ada@example.com", "pw");
    expect(firebase.signOut).not.toHaveBeenCalled();
  });

  it("still reports 'not verified' if signing out fails, since the app ignores unverified sessions anyway", async () => {
    firebase.signInWithEmailAndPassword.mockResolvedValue({ user: user(false) });
    firebase.signOut.mockRejectedValue(new Error("offline"));

    const failure = await createFirebaseIdentity()
      .signIn("ada@example.com", "pw")
      .catch((error: unknown) => error);
    expect((failure as IdentityError).code).toBe(EMAIL_NOT_VERIFIED);
  });
});

describe("onSessionChanged", () => {
  it("reports an unverified account as signed out, and a verified one as a session", () => {
    const listener = vi.fn();
    createFirebaseIdentity().onSessionChanged(listener);
    const onFirebaseChange = firebase.onIdTokenChanged.mock.calls[0]![1] as (u: User | null) => void;

    onFirebaseChange(user(false));
    onFirebaseChange(null);
    onFirebaseChange(user(true));

    expect(listener.mock.calls).toEqual([[null], [null], [{ uid: "uid-1", email: "ada@example.com" }]]);
  });
});

describe("resendVerificationEmail", () => {
  it("sends a fresh link to an unverified account and signs out again", async () => {
    firebase.signInWithEmailAndPassword.mockResolvedValue({ user: user(false) });
    const calls = trackOrder();

    await expect(createFirebaseIdentity().resendVerificationEmail("ada@example.com", "pw")).resolves.toBe(true);
    expect(calls).toEqual(["send", "signOut"]);
  });

  it("sends nothing, and leaves the user signed in, if the email was verified in the meantime", async () => {
    firebase.signInWithEmailAndPassword.mockResolvedValue({ user: user(true) });

    await expect(createFirebaseIdentity().resendVerificationEmail("ada@example.com", "pw")).resolves.toBe(false);
    expect(firebase.sendEmailVerification).not.toHaveBeenCalled();
    expect(firebase.signOut).not.toHaveBeenCalled();
  });

  it("signs out even when the email can't be sent", async () => {
    firebase.signInWithEmailAndPassword.mockResolvedValue({ user: user(false) });
    firebase.sendEmailVerification.mockRejectedValue({ code: "auth/too-many-requests" });

    await expect(createFirebaseIdentity().resendVerificationEmail("ada@example.com", "pw")).rejects.toBeInstanceOf(
      IdentityError,
    );
    expect(firebase.signOut).toHaveBeenCalledTimes(1);
  });

  it("rejects a wrong password without sending anything", async () => {
    firebase.signInWithEmailAndPassword.mockRejectedValue({ code: "auth/invalid-credential" });

    await expect(createFirebaseIdentity().resendVerificationEmail("ada@example.com", "bad")).rejects.toBeInstanceOf(
      IdentityError,
    );
    expect(firebase.sendEmailVerification).not.toHaveBeenCalled();
  });
});

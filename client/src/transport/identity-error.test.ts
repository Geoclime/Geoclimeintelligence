import { describe, expect, it } from "vitest";
import { EMAIL_NOT_VERIFIED, IdentityError, identityErrorFromCode, toIdentityError } from "./identity-error";

describe("toIdentityError", () => {
  it("gives wrong-email and wrong-password the same message, so accounts can't be probed", () => {
    const messages = ["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password"].map(
      (code) => toIdentityError({ code }).message,
    );
    expect(new Set(messages).size).toBe(1);
  });

  it("never shows Firebase's raw message", () => {
    const error = toIdentityError({ code: "auth/something-new", message: "Firebase: Error (auth/something-new)." });
    expect(error).toBeInstanceOf(IdentityError);
    expect(error.message).toBe("Something went wrong. Please try again.");
    expect(error.code).toBe("auth/something-new");
  });

  it("explains an unverified email in plain words", () => {
    const error = identityErrorFromCode(EMAIL_NOT_VERIFIED);
    expect(error.code).toBe(EMAIL_NOT_VERIFIED);
    expect(error.message).toMatch(/verify your email/i);
  });

  it("handles throwables with no code", () => {
    expect(toIdentityError(null).code).toBe("unknown");
  });
});

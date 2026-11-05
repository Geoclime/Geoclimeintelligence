import { z } from "zod";
import { ORGANISATION_REQUIRED, REASON_MAX, REASON_MIN, REASON_TOO_SHORT } from "../../components/users/role-request.schema";
import { REQUESTABLE_ROLES } from "../../types/auth.types";

// Client-side checks are for fast feedback only. Firebase (for credentials) and the backend
// (for everything else) re-check whatever they receive (standard section 11).

const email = z.email({ error: "Enter a valid email address" });

export const signInSchema = z.object({
  email,
  password: z.string().min(1, { error: "Enter your password" }),
});
export type SignInInput = z.infer<typeof signInSchema>;

/** Firebase's own minimum is 6; asking for 8 is a courtesy that nudges toward safer passwords. */
export const PASSWORD_MIN_LENGTH = 8;

export const signUpSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, { error: "Enter your full name" })
      .max(200, { error: "Use 200 characters or fewer" }),
    email,
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, { error: `Use at least ${PASSWORD_MIN_LENGTH} characters` })
      .max(128, { error: "Use 128 characters or fewer" }),
    confirmPassword: z.string().min(1, { error: "Re-enter your password" }),
    // Who they are joining as. Anything but the public is a REQUEST, sent after the first sign-in;
    // the account itself always starts as General Public.
    joiningAs: z.enum(["general_public", ...REQUESTABLE_ROLES]),
    organisation: z.string().trim().max(200, { error: "Use 200 characters or fewer" }),
    jobTitle: z.string().trim().max(120, { error: "Use 120 characters or fewer" }),
    reason: z.string().trim().max(REASON_MAX, { error: `Use ${REASON_MAX} characters or fewer` }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    error: "Passwords don't match",
  })
  .superRefine((values, ctx) => {
    if (values.joiningAs === "general_public") return;
    if (values.organisation.length < 2) ctx.addIssue({ code: "custom", path: ["organisation"], message: ORGANISATION_REQUIRED });
    if (values.reason.length < REASON_MIN) ctx.addIssue({ code: "custom", path: ["reason"], message: REASON_TOO_SHORT });
  });
export type SignUpInput = z.infer<typeof signUpSchema>;

export const passwordResetSchema = z.object({ email });
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

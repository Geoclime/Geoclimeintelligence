import { z } from "zod";

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
    email,
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, { error: `Use at least ${PASSWORD_MIN_LENGTH} characters` })
      .max(128, { error: "Use 128 characters or fewer" }),
    confirmPassword: z.string().min(1, { error: "Re-enter your password" }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    error: "Passwords don't match",
  });
export type SignUpInput = z.infer<typeof signUpSchema>;

export const passwordResetSchema = z.object({ email });
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

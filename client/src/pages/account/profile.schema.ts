import { z } from "zod";

// Mirrors updateProfileSchema in server/src/modules/auth/auth.validation.ts, for fast feedback.
// The backend re-checks everything; an empty field is sent as null, which clears it.

const PHONE_PATTERN = /^\+?[0-9 ()-]{6,24}$/;

export const profileSchema = z.object({
  displayName: z.string().trim().max(200, { error: "Use 200 characters or fewer" }),
  phone: z
    .string()
    .trim()
    .max(32, { error: "Use 32 characters or fewer" })
    .refine((value) => !value || PHONE_PATTERN.test(value), {
      error: "Use digits, spaces, brackets or dashes, e.g. +234 803 123 4567",
    }),
  organisation: z.string().trim().max(200, { error: "Use 200 characters or fewer" }),
  jobTitle: z.string().trim().max(120, { error: "Use 120 characters or fewer" }),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const PROFILE_FIELDS = ["displayName", "phone", "organisation", "jobTitle"] as const;

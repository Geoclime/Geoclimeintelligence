import { z } from "zod";
import { isValidPhone } from "../../utils/phone";

// Mirrors updateProfileSchema in server/src/modules/auth/auth.validation.ts, for fast feedback.
// The backend re-checks everything; an empty field is sent as null, which clears it.
// The phone number comes from PhoneField already in international format ("+2348031234567").

// Name, phone and home area make a complete profile: required here, and the server refuses to clear them.
export const profileSchema = z.object({
  displayName: z.string().trim().min(2, { error: "Enter your full name" }).max(200, { error: "Use 200 characters or fewer" }),
  phone: z
    .string()
    .trim()
    .min(1, { error: "Enter a phone number we can reach you on" })
    .refine(isValidPhone, { error: "Enter the full number after the country code, e.g. 803 123 4567" }),
  homeAdminUnitId: z.string().min(1, { error: "Choose the LGA you live or work in" }),
  organisation: z.string().trim().max(200, { error: "Use 200 characters or fewer" }),
  jobTitle: z.string().trim().max(120, { error: "Use 120 characters or fewer" }),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const PROFILE_FIELDS = ["displayName", "phone", "homeAdminUnitId", "organisation", "jobTitle"] as const;

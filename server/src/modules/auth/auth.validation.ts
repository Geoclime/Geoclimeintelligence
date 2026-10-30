import { z } from "zod";
import { REQUESTABLE_ROLES } from "../../common/access/roles";

/** Trims; an empty string means "clear this field" and is stored as null. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null));

// Digits, spaces and the usual separators, with an optional leading +. Formats vary too much
// across countries to check more than that.
const PHONE_PATTERN = /^\+?[0-9 ()-]{6,24}$/;

/**
 * PATCH /api/v1/auth/me. Strict: role and scopeAdminUnitId are rejected, never silently ignored,
 * so a client can't believe it changed its own access.
 */
export const updateProfileSchema = z.object({
  body: z
    .object({
      displayName: optionalText(200, "Name"),
      phone: optionalText(32, "Phone number").refine((value) => !value || PHONE_PATTERN.test(value), {
        message: "Enter a phone number using digits, spaces, brackets or dashes, e.g. +234 803 123 4567",
      }),
      organisation: optionalText(200, "Organisation"),
      jobTitle: optionalText(120, "Job title"),
    })
    .strict()
    .refine((body) => Object.values(body).some((value) => value !== undefined), {
      message: "Provide at least one of displayName, phone, organisation or jobTitle",
    }),
});
export type UpdateProfileBody = z.infer<typeof updateProfileSchema>["body"];

/**
 * PUT /api/v1/auth/me/role-request: ask an administrator for a staff role. Only the requestable
 * roles are accepted (never administrator). The organisation and job title, when given, are
 * saved to the profile so the administrator sees who is asking.
 */
export const roleRequestSchema = z.object({
  body: z
    .object({
      role: z.enum(REQUESTABLE_ROLES, { error: "Choose Emergency Responder, Government Official or Researcher" }),
      reason: z
        .string({ error: "Tell the administrator why you need this role" })
        .trim()
        .min(10, "Tell the administrator a little more (at least 10 characters)")
        .max(500, "Keep the reason under 500 characters"),
      organisation: optionalText(200, "Organisation"),
      jobTitle: optionalText(120, "Job title"),
    })
    .strict(),
});
export type RoleRequestBody = z.infer<typeof roleRequestSchema>["body"];

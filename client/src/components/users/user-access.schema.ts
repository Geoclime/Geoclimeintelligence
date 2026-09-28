import { z } from "zod";
import { USER_ROLES } from "../../types/auth.types";
import type { UserAccessPatch } from "../../types/user.types";
import { isRegionScopable } from "../../utils/roles";

/**
 * The access form. Field names match the backend's updateUserAccessSchema body
 * (server/src/modules/users/user.validation.ts), so a 400's field errors land on the right input.
 * The scope is a raw region ID for now: the admin-unit picker needs the Phase 2 admin_units data.
 */
export const userAccessSchema = z
  .object({
    role: z.enum(USER_ROLES, { error: "Choose a role" }),
    scopeAdminUnitId: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (!isRegionScopable(values.role) || values.scopeAdminUnitId === "") return;
    if (!z.uuid().safeParse(values.scopeAdminUnitId).success) {
      ctx.addIssue({
        code: "custom",
        path: ["scopeAdminUnitId"],
        message: "Enter a valid region ID (a UUID), or leave it blank for all of Rivers State",
      });
    }
  });

export type UserAccessFormValues = z.infer<typeof userAccessSchema>;

/**
 * Always sends both fields. A role that can't carry a scope must send `null`: the backend keeps
 * the old scope when the field is omitted, then rejects that combination.
 */
export function toAccessPatch(values: UserAccessFormValues): UserAccessPatch {
  return {
    role: values.role,
    scopeAdminUnitId: isRegionScopable(values.role) && values.scopeAdminUnitId ? values.scopeAdminUnitId : null,
  };
}

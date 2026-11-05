import { z } from "zod";
import type { UserAccessPatch } from "../../types/user.types";
import { isRegionScopable } from "../../utils/roles";

/**
 * The access form. Field names match the backend's updateUserAccessSchema body
 * (server/src/modules/users/user.validation.ts), so a 400's field errors land on the right input.
 * The scope is a raw region ID for now: the admin-unit picker needs the Phase 2 admin_units data.
 */
export const userAccessSchema = z
  .object({
    // Any role on the Roles screen, built-in or made by an administrator; the server checks it exists.
    role: z.string().trim().min(1, { error: "Choose a role" }),
    scopeAdminUnitId: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (values.scopeAdminUnitId === "") return;
    if (!z.uuid().safeParse(values.scopeAdminUnitId).success) {
      ctx.addIssue({
        code: "custom",
        path: ["scopeAdminUnitId"],
        message: "Enter a valid region ID (a UUID), or leave it blank for all regions",
      });
    }
  });

export type UserAccessFormValues = z.infer<typeof userAccessSchema>;

/**
 * Always sends both fields. A role that can't carry a scope must send `null`: the backend keeps
 * the old scope when the field is omitted, then rejects that combination.
 */
export function toAccessPatch(values: UserAccessFormValues, roles?: readonly { code: string; canBeScoped: boolean }[]): UserAccessPatch {
  return {
    role: values.role,
    scopeAdminUnitId: isRegionScopable(values.role, roles) && values.scopeAdminUnitId ? values.scopeAdminUnitId : null,
  };
}

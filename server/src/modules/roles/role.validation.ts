import { z } from "zod";
import { PERMISSIONS, type Permission } from "../../common/access/permissions";

const roleCode = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{1,31}$/, "Use 2 to 32 lower-case letters, digits or underscores, starting with a letter (e.g. field_inspector)");
const permissions = z.array(z.enum(PERMISSIONS as [Permission, ...Permission[]], "That is not a permission the platform knows")).max(PERMISSIONS.length);

const roleParams = z.object({ code: roleCode });

export const createRoleSchema = z.object({
  body: z
    .object({
      code: roleCode,
      name: z.string().trim().min(2, "Give the role a name").max(64),
      description: z.string().trim().min(1, "Say who the role is for").max(500),
      canBeScoped: z.boolean().default(false),
      permissions: permissions.default([]),
    })
    .strict(),
});
export type CreateRoleBody = z.infer<typeof createRoleSchema>["body"];

export const updateRoleSchema = z.object({
  params: roleParams,
  body: z
    .object({
      name: z.string().trim().min(2).max(64).optional(),
      description: z.string().trim().min(1).max(500).optional(),
      canBeScoped: z.boolean().optional(),
      permissions: permissions.optional(),
    })
    .strict(),
});
export type UpdateRoleBody = z.infer<typeof updateRoleSchema>["body"];

export const roleCodeSchema = z.object({ params: roleParams });

import { z } from "zod";
/** A role code: a built-in one or one an administrator created. The service checks that it exists. */
const roleCode = z.string().trim().regex(/^[a-z][a-z0-9_]{1,31}$/, "Not a role code");
import { offsetPageQuerySchema } from "../../common/pagination/pagination";

const userIdParams = z.object({ id: z.uuid() });

export const listUsersSchema = z.object({
  query: offsetPageQuerySchema.extend({
    q: z.string().trim().max(100).optional().transform((value) => value || undefined),
    role: roleCode.optional(),
    // "true" lists only users with an open role request; anything else is ignored.
    pendingRequest: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => (value === "true" ? true : undefined)),
  }),
});
export type ListUsersQuery = z.infer<typeof listUsersSchema>["query"];

export const getUserSchema = z.object({
  params: userIdParams,
});

export const updateUserAccessSchema = z.object({
  params: userIdParams,
  body: z
    .object({
      role: roleCode.optional(),
      scopeAdminUnitId: z.uuid().nullable().optional(),
    })
    .strict()
    .refine((body) => body.role !== undefined || body.scopeAdminUnitId !== undefined, {
      message: "Provide role, scopeAdminUnitId, or both",
    }),
});
export type UpdateUserAccessBody = z.infer<typeof updateUserAccessSchema>["body"];

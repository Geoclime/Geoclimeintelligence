import { z } from "zod";
import { USER_ROLES } from "../../common/access/roles";
import { offsetPageQuerySchema } from "../../common/pagination/pagination";

const userIdParams = z.object({ id: z.uuid() });

export const listUsersSchema = z.object({
  query: offsetPageQuerySchema,
});
export type ListUsersQuery = z.infer<typeof listUsersSchema>["query"];

export const getUserSchema = z.object({
  params: userIdParams,
});

export const updateUserAccessSchema = z.object({
  params: userIdParams,
  body: z
    .object({
      role: z.enum(USER_ROLES).optional(),
      scopeAdminUnitId: z.uuid().nullable().optional(),
    })
    .strict()
    .refine((body) => body.role !== undefined || body.scopeAdminUnitId !== undefined, {
      message: "Provide role, scopeAdminUnitId, or both",
    }),
});
export type UpdateUserAccessBody = z.infer<typeof updateUserAccessSchema>["body"];

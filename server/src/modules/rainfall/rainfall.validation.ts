import { z } from "zod";

const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM, e.g. 2016-01");

export const getRainfallSchema = z.object({
  query: z
    .object({
      adminUnitId: z.uuid("Not a valid area id"),
      from: yearMonthSchema.optional(),
      to: yearMonthSchema.optional(),
    })
    .refine((q) => !q.from || !q.to || q.from <= q.to, { path: ["to"], message: "to must not be before from" }),
});
export type GetRainfallQuery = z.infer<typeof getRainfallSchema>["query"];

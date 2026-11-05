import { z } from "zod";
import { bboxQuerySchema } from "../../common/geo/geo";

const label = z.string().trim().min(1, "Give it a name, like “Home”").max(80, "Keep the name to 80 characters or fewer");
const note = z.string().trim().max(300, "Keep the note to 300 characters or fewer");
const people = z.number({ error: "How many people live there, as a number" }).int("A whole number of people").min(1).max(200);

/** POST /api/v1/households: a home, where it is, and optionally how many live there. */
export const createHouseholdSchema = z.object({
  body: z
    .object({
      label,
      note: note.optional(),
      people: people.optional(),
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90),
    })
    .strict(),
});
export type CreateHouseholdBody = z.infer<typeof createHouseholdSchema>["body"];

/** PATCH /api/v1/households/:id. A blank note clears it; null clears the number of people. The spot can't be moved. */
export const updateHouseholdSchema = z.object({
  params: z.object({ id: z.uuid("Not a valid id") }),
  body: z
    .object({ label: label.optional(), note: note.optional(), people: people.nullable().optional() })
    .strict()
    .refine((body) => Object.values(body).some((value) => value !== undefined), { message: "Change the name, the note or the number of people" }),
});
export type UpdateHouseholdBody = z.infer<typeof updateHouseholdSchema>["body"];

export const householdIdSchema = z.object({ params: z.object({ id: z.uuid("Not a valid id") }) });

export const householdGeoJsonSchema = z.object({ query: z.object({ bbox: bboxQuerySchema }) });

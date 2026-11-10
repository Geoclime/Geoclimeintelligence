import { z } from "zod";
import { bboxQuerySchema } from "../../common/geo/geo";
import { optionalPhone } from "../../common/validation/phone";
import { HOME_TYPES } from "./household.types";

const label = z.string().trim().min(1, "Give it a name, like “Home”").max(80, "Keep the name to 80 characters or fewer");
const note = z.string().trim().max(300, "Keep the note to 300 characters or fewer");
const homeType = z.enum(HOME_TYPES, "Choose house, compound, apartment or other");
const people = z.number({ error: "How many people live there, as a number" }).int("A whole number of people").min(1).max(200);

/** POST /api/v1/households: a home, where it is, and optionally how many live there. */
export const createHouseholdSchema = z.object({
  body: z
    .object({
      label,
      note: note.optional(),
      people: people.optional(),
      homeType: homeType.optional(),
      phone: optionalPhone.optional(),
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90),
    })
    .strict(),
});
export type CreateHouseholdBody = z.infer<typeof createHouseholdSchema>["body"];

/** PATCH /api/v1/households/:id. A blank note or phone number clears it; null clears the number of people and the kind of home. The spot can't be moved. */
export const updateHouseholdSchema = z.object({
  params: z.object({ id: z.uuid("Not a valid id") }),
  body: z
    .object({ label: label.optional(), note: note.optional(), people: people.nullable().optional(), homeType: homeType.nullable().optional(), phone: optionalPhone.optional() })
    .strict()
    .refine((body) => Object.values(body).some((value) => value !== undefined), { message: "Change the name, the kind of home, the phone number, the note or the number of people" }),
});
export type UpdateHouseholdBody = z.infer<typeof updateHouseholdSchema>["body"];

/** GET /api/v1/households/search?q=: the viewer's own households by name, note, kind of home or area (staff: everyone's). */
export const householdSearchSchema = z.object({
  query: z.object({ q: z.string().trim().min(2, "Type at least 2 characters").max(60, "Keep the search under 60 characters") }),
});

export const householdIdSchema = z.object({ params: z.object({ id: z.uuid("Not a valid id") }) });

export const householdGeoJsonSchema = z.object({ query: z.object({ bbox: bboxQuerySchema }) });

import { z } from "zod";
import { facilityTypeOf, MAX_FACILITY_NAME_LENGTH, MAX_FACILITY_NOTE_LENGTH } from "./layer-rules";

// Bodies arrive as JSON, so numbers are checked as numbers: z.coerce would turn null into 0.
const longitude = z.number({ error: "Longitude must be a number" }).min(-180, "Longitude must be between -180 and 180").max(180, "Longitude must be between -180 and 180");
const latitude = z.number({ error: "Latitude must be a number" }).min(-90, "Latitude must be between -90 and 90").max(90, "Latitude must be between -90 and 90");

const name = z
  .string({ error: "Give the place a name" })
  .trim()
  .min(2, "Give the place a name")
  .max(MAX_FACILITY_NAME_LENGTH, `Keep the name to ${MAX_FACILITY_NAME_LENGTH} characters or fewer`);

/** A Geofabrik class the layer knows (hospital, clinic, school...), the same ones an import keeps. */
const kind = z
  .string({ error: "Choose what kind of place this is" })
  .trim()
  .toLowerCase()
  .refine((value) => facilityTypeOf(value) !== null, "Choose what kind of place this is");

const note = z.string().trim().max(MAX_FACILITY_NOTE_LENGTH, `Keep the note to ${MAX_FACILITY_NOTE_LENGTH} characters or fewer`);

/** POST /api/v1/infrastructure: save a place an import didn't capture. Administrator only. */
export const createFacilitySchema = z.object({
  body: z
    .object({
      name,
      kind,
      /** Optional; blank is the same as none. */
      note: note.optional(),
      longitude,
      latitude,
    })
    .strict(),
});
export type CreateFacilityBody = z.infer<typeof createFacilitySchema>["body"];

export const facilityIdSchema = z.object({
  params: z.object({ id: z.uuid("Not a valid facility id") }),
});

/** PATCH /api/v1/infrastructure/:id. Send only what changes; a blank note clears it. The point itself can't move: delete the place and save it again. */
export const updateFacilitySchema = z.object({
  params: z.object({ id: z.uuid("Not a valid facility id") }),
  body: z
    .object({ name: name.optional(), kind: kind.optional(), note: note.optional() })
    .strict()
    .refine((body) => Object.values(body).some((value) => value !== undefined), { message: "Change at least one thing: the name, kind or note" }),
});
export type UpdateFacilityBody = z.infer<typeof updateFacilitySchema>["body"];

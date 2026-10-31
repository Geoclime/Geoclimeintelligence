import { z } from "zod";
import type { LonLat } from "../../types/admin-unit.types";
import type { NewPlaceBody, UpdatePlaceBody } from "../../types/map-layer.types";

/** Mirror MAX_FACILITY_NAME_LENGTH and MAX_FACILITY_NOTE_LENGTH in server/src/modules/map-layers/layer-rules.ts. */
export const MAX_PLACE_NAME_LENGTH = 200;
export const MAX_PLACE_NOTE_LENGTH = 500;

/** Mirrors createFacilitySchema and updateFacilitySchema on the server (server/src/modules/map-layers/facility.validation.ts). */
export const placeFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Give the place a name" })
    .max(MAX_PLACE_NAME_LENGTH, { error: `Keep the name to ${MAX_PLACE_NAME_LENGTH} characters or fewer` }),
  /** A facility class from utils/facility-kinds.ts. */
  kind: z.string().min(1, { error: "Choose what kind of place this is" }),
  note: z.string().trim().max(MAX_PLACE_NOTE_LENGTH, { error: `Keep the note to ${MAX_PLACE_NOTE_LENGTH} characters or fewer` }),
});
export type PlaceFormValues = z.infer<typeof placeFormSchema>;

export function toNewPlaceBody(values: PlaceFormValues, point: LonLat): NewPlaceBody {
  const body: NewPlaceBody = { name: values.name.trim(), kind: values.kind, longitude: point[0], latitude: point[1] };
  if (values.note.trim()) body.note = values.note.trim();
  return body;
}

/** Sends all three, so a blank note clears the old one. */
export function toUpdatePlaceBody(values: PlaceFormValues): UpdatePlaceBody {
  return { name: values.name.trim(), kind: values.kind, note: values.note.trim() };
}

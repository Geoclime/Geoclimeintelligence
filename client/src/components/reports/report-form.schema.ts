import { z } from "zod";
import { WATER_DEPTHS } from "../../types/flood-report.types";

/** Mirrors createReportSchema on the server (server/src/modules/flood-reports/flood-report.validation.ts). */
export const reportFormSchema = z.object({
  locationName: z.string().trim().min(2, { error: "Name the place, e.g. a street or landmark" }).max(200),
  // An empty choice fails here with a clear message rather than a type error.
  waterDepth: z.enum(WATER_DEPTHS, { error: "Choose how deep the water is" }),
  description: z.string().trim().min(10, { error: "Describe what you see in a sentence or two" }).max(2000),
});
export type ReportFormValues = z.infer<typeof reportFormSchema>;

export const MAX_PHOTOS = 3;
/** Voice notes stop recording at this length. */
export const MAX_RECORDING_SECONDS = 60;

import { z } from "zod";
import { DRAINAGE_CONDITIONS, DRAINAGE_KINDS, FLOOD_DEPTHS, SURVEY_LIMITS, SURVEY_METHODS, distinctPoints, isLineKind } from "./survey-rules";

// Bodies arrive as JSON, so numbers are checked as numbers: z.coerce would turn null into 0.
const longitude = z.number({ error: "A longitude must be a number" }).min(-180, "Longitude must be between -180 and 180").max(180, "Longitude must be between -180 and 180");
const latitude = z.number({ error: "A latitude must be a number" }).min(-90, "Latitude must be between -90 and 90").max(90, "Latitude must be between -90 and 90");

/** [longitude, latitude] -- GeoJSON's own order. */
const point = z.tuple([longitude, latitude], { error: "Each point must be [longitude, latitude]" });

const note = z.string().trim().max(SURVEY_LIMITS.noteLength, `Keep the note to ${SURVEY_LIMITS.noteLength} characters or fewer`);
const name = z.string().trim().max(SURVEY_LIMITS.nameLength, `Keep the name to ${SURVEY_LIMITS.nameLength} characters or fewer`);
const method = z.enum(SURVEY_METHODS, { error: "Say whether the shape was walked or drawn" });
const size = (what: string) =>
  z
    .number({ error: `${what} must be a number of metres` })
    .positive(`${what} must be more than zero`)
    .max(SURVEY_LIMITS.maxDrainSizeM, `${what} can't be more than ${SURVEY_LIMITS.maxDrainSizeM} m`);

const idParams = z.object({ id: z.uuid("Not a valid id") });
export const surveyIdSchema = z.object({ params: idParams });

/** GET /api/v1/drainage/summary?areaId=&limit=: the drainage recorded in an LGA or ward, the worst first. */
export const drainageSummarySchema = z.object({
  query: z.object({
    areaId: z.uuid("Choose an LGA or ward"),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

/** GET /api/v1/flood-extents/history?areaId=&limit=: the floods recorded in an LGA or ward, newest first. */
export const floodHistorySchema = z.object({
  query: z.object({
    areaId: z.uuid("Choose an LGA or ward"),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});
export type FloodHistoryQuery = z.infer<typeof floodHistorySchema>["query"];

/** POST /api/v1/flood-extents: the points around the edge of a flood, in order. Closed for you. */
export const createFloodExtentSchema = z.object({
  body: z
    .object({
      points: z
        .array(point)
        .min(SURVEY_LIMITS.extentMinPoints, "Mark at least three points around the flood")
        .max(SURVEY_LIMITS.maxPoints, `Send at most ${SURVEY_LIMITS.maxPoints} points`),
      method,
      depth: z.enum(FLOOD_DEPTHS, { error: "Choose how deep the water is" }).optional(),
      note: note.optional(),
      /** The typical GPS accuracy of a walk, in metres. Left out for a shape drawn on the map. */
      accuracyM: z.number().min(0).max(10_000).optional(),
    })
    .strict()
    .refine((body) => distinctPoints(body.points) >= SURVEY_LIMITS.extentMinPoints, {
      path: ["points"],
      message: "The points are all in the same place: walk or tap around the edge of the flood",
    }),
});
export type CreateFloodExtentBody = z.infer<typeof createFloodExtentSchema>["body"];

/** POST /api/v1/drainage: a drain walked as a line (open or covered), or one spot (culvert, outfall, inlet, pond). */
export const createDrainageSchema = z.object({
  body: z
    .object({
      kind: z.enum(DRAINAGE_KINDS, { error: "Choose what kind of drainage this is" }),
      condition: z.enum(DRAINAGE_CONDITIONS, { error: "Choose the condition it is in" }),
      name: name.optional(),
      widthM: size("Width").optional(),
      depthM: size("Depth").optional(),
      note: note.optional(),
      method,
      points: z.array(point).min(1, "Mark where it is").max(SURVEY_LIMITS.maxPoints, `Send at most ${SURVEY_LIMITS.maxPoints} points`),
    })
    .strict()
    .superRefine((body, ctx) => {
      if (isLineKind(body.kind)) {
        if (distinctPoints(body.points) < 2) ctx.addIssue({ code: "custom", path: ["points"], message: "Walk along the drain, or tap at least two points along it" });
      } else if (body.points.length !== 1) {
        ctx.addIssue({ code: "custom", path: ["points"], message: "This kind of drainage is one spot: mark a single point" });
      }
    }),
});
export type CreateDrainageBody = z.infer<typeof createDrainageSchema>["body"];

/** PATCH /api/v1/drainage/:id: an inspection. Send only what changed; saving it also resets "last checked". Blank clears a name or note, null a size. */
export const updateDrainageSchema = z.object({
  params: idParams,
  body: z
    .object({
      condition: z.enum(DRAINAGE_CONDITIONS, { error: "Choose the condition it is in" }).optional(),
      name: name.optional(),
      widthM: size("Width").nullable().optional(),
      depthM: size("Depth").nullable().optional(),
      note: note.optional(),
    })
    .strict()
    .refine((body) => Object.values(body).some((value) => value !== undefined), { message: "Change at least one thing: the condition, name, size or note" }),
});
export type UpdateDrainageBody = z.infer<typeof updateDrainageSchema>["body"];

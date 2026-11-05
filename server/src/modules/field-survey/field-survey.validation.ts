import { z } from "zod";
import { DRAIN_MATERIALS, DRAINAGE_CONDITIONS, DRAINAGE_KINDS, FLOOD_DEPTHS, FLOW_DIRECTIONS, SURVEY_LIMITS, SURVEY_METHODS, distinctPoints, isLineKind } from "./survey-rules";

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

const flowDirection = z.enum(FLOW_DIRECTIONS, { error: "Say which way the water flows: with the line or against it" });
const material = z.enum(DRAIN_MATERIALS, { error: "Choose what it is made of" });
const diameter = z
  .number({ error: "A diameter must be a number of metres" })
  .positive("A diameter must be more than zero")
  .max(SURVEY_LIMITS.maxDiameterM, `A diameter can't be more than ${SURVEY_LIMITS.maxDiameterM} m`);
const barrels = z.number().int("Count whole pipes").min(1).max(SURVEY_LIMITS.maxBarrels, `At most ${SURVEY_LIMITS.maxBarrels} pipes`);

/** Where the person stood when they checked, if the phone shared it: kept with the inspection, never shown publicly. */
const standingAt = z
  .object({ longitude, latitude, accuracyM: z.number().min(0).max(10_000).optional() })
  .strict();

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
      flowDirection: flowDirection.optional(),
      diameterM: diameter.optional(),
      material: material.optional(),
      barrels: barrels.optional(),
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
      if (body.flowDirection && !isLineKind(body.kind)) {
        ctx.addIssue({ code: "custom", path: ["flowDirection"], message: "Only a drain along the ground has a direction of flow" });
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
      flowDirection: flowDirection.nullable().optional(),
      diameterM: diameter.nullable().optional(),
      material: material.nullable().optional(),
      barrels: barrels.nullable().optional(),
      /** What the inspector wants kept about this check (the drain's own note is `note`). */
      inspectionNote: note.optional(),
      /** Where they stood, so the log can say how far from the drain the check was made. */
      at: standingAt.optional(),
    })
    .strict(),
});

/** GET /api/v1/drainage/:id/inspections?limit=: who checked it and what they found, newest first (staff-only). */
export const drainInspectionsSchema = z.object({
  params: idParams,
  query: z.object({ limit: z.coerce.number().int().min(1).max(SURVEY_LIMITS.inspectionListMax).default(20) }),
});

/** POST /api/v1/drainage/import: a drainage plan as GeoJSON (multipart `file`), for a country. */
export const importDrainageSchema = z.object({
  body: z.object({
    countryCode: z.string().trim().length(3, "Choose the country").transform((code) => code.toUpperCase()),
    wardLevel: z.coerce.number().int().min(1).max(6).default(3),
    /** When the plan was surveyed: the "last checked" of every drain it gives no date for. */
    planDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Say when the plan was surveyed, like 2024-06-30"),
  }),
});
export type ImportDrainageBody = z.infer<typeof importDrainageSchema>["body"];
export type UpdateDrainageBody = z.infer<typeof updateDrainageSchema>["body"];

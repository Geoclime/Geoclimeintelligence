import { z } from "zod";
import { WATER_DEPTHS, type WaterDepth } from "../../types/flood-report.types";
import {
  DRAINAGE_CONDITIONS,
  DRAINAGE_KINDS,
  type DrainageKind,
  type NewDrainageBody,
  type NewFloodExtentBody,
  type SelectedSurvey,
  type SurveyTarget,
  type UpdateDrainageBody,
} from "../../types/field-survey.types";
import { isLineKind } from "../../utils/field-survey";
import { thinPoints } from "../../utils/survey-geometry";
import type { Walk } from "../../utils/walk-state";

/** Mirror createFloodExtentSchema and createDrainageSchema on the server (server/src/modules/field-survey/field-survey.validation.ts). */
export const MAX_SURVEY_NOTE_LENGTH = 500;
export const MAX_DRAIN_NAME_LENGTH = 120;
export const MAX_DRAIN_SIZE_M = 100;

const note = z.string().trim().max(MAX_SURVEY_NOTE_LENGTH, { error: `Keep the note to ${MAX_SURVEY_NOTE_LENGTH} characters or fewer` });

/** A size typed in metres: blank, or a number above zero and no more than the server allows. */
const size = (what: string) =>
  z.string().trim().refine((value) => {
    if (value === "") return true;
    const metres = Number(value);
    return Number.isFinite(metres) && metres > 0 && metres <= MAX_DRAIN_SIZE_M;
  }, { error: `${what} must be a number of metres between 0 and ${MAX_DRAIN_SIZE_M}, or left blank` });

export const floodFormSchema = z.object({
  /** One of WATER_DEPTHS, or "" when not judged. */
  depth: z.string().refine((value) => value === "" || (WATER_DEPTHS as readonly string[]).includes(value), { error: "Choose how deep the water is" }),
  note,
});
export type FloodFormValues = z.infer<typeof floodFormSchema>;

export const drainFormSchema = z.object({
  kind: z.enum(DRAINAGE_KINDS, { error: "Choose what kind of drainage this is" }),
  condition: z.enum(DRAINAGE_CONDITIONS, { error: "Choose the condition it is in" }),
  name: z.string().trim().max(MAX_DRAIN_NAME_LENGTH, { error: `Keep the name to ${MAX_DRAIN_NAME_LENGTH} characters or fewer` }),
  widthM: size("Width"),
  depthM: size("Depth"),
  note,
});
export type DrainFormValues = z.infer<typeof drainFormSchema>;

/** The recorded walk as the server takes it: thinned, with the typical GPS accuracy when it was walked. */
export function toFloodBody(values: FloodFormValues, walk: Pick<Walk, "points">, extra: { method: "walked" | "drawn"; accuracyM?: number }): NewFloodExtentBody {
  const body: NewFloodExtentBody = { points: thinPoints(walk.points), method: extra.method };
  if (extra.method === "walked" && extra.accuracyM !== undefined) body.accuracyM = Math.round(extra.accuracyM * 10) / 10;
  if (values.depth) body.depth = values.depth as WaterDepth;
  if (values.note.trim()) body.note = values.note.trim();
  return body;
}

/** A spot sends its one point; a drain along the ground sends the walk, thinned. */
export function toDrainBody(values: DrainFormValues, walk: Pick<Walk, "points">, method: "walked" | "drawn"): NewDrainageBody {
  const spot = !isLineKind(values.kind);
  const body: NewDrainageBody = {
    kind: values.kind,
    condition: values.condition,
    method,
    points: spot ? walk.points.slice(0, 1) : thinPoints(walk.points),
  };
  if (values.name.trim()) body.name = values.name.trim();
  if (values.widthM.trim()) body.widthM = Number(values.widthM);
  if (values.depthM.trim()) body.depthM = Number(values.depthM);
  if (values.note.trim()) body.note = values.note.trim();
  return body;
}

/** The drain kinds that suit what was recorded: a walked line is a drain, a spot is anything else. */
export function kindsFor(target: SurveyTarget): readonly DrainageKind[] {
  return DRAINAGE_KINDS.filter((kind) => isLineKind(kind) === (target === "drain-line"));
}

/** An inspection from a drain's popup: only the condition, and a note if one was written. */
export function toInspection(condition: UpdateDrainageBody["condition"], note?: string): UpdateDrainageBody {
  return note === undefined ? { condition } : { condition, note };
}

/** What a popup shows for a saved flood right after it was saved. */
export function selectedFlood(saved: {
  id: string;
  areaM2: number;
  depth: WaterDepth | null;
  method: "walked" | "drawn";
  observedAt: string;
  lgaId: string | null;
  wardId: string | null;
  longitude: number;
  latitude: number;
}): Extract<SelectedSurvey, { type: "flood" }> {
  const { id, areaM2, depth, method, observedAt, lgaId, wardId, longitude, latitude } = saved;
  return { type: "flood", point: [longitude, latitude], properties: { id, areaM2, depth, method, receded: false, observedAt, lgaId, wardId } };
}

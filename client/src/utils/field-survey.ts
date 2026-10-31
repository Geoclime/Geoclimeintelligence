import type { UserRole } from "../types/auth.types";
import {
  DRAINAGE_CONDITIONS,
  type DrainageCondition,
  type DrainageKind,
  type SurveyTarget,
} from "../types/field-survey.types";
import { hasAnyRole } from "./roles";

/** Words and rules for field survey: what is recorded, what the conditions mean, and who records it. */

/** Mirrors the server's authorise() on the survey routes: responders, officials, and administrators (who always pass). */
export function canRecordSurvey(role: UserRole): boolean {
  return hasAnyRole(role, ["emergency_responder", "government_official"]);
}

export const LINE_DRAIN_KINDS: readonly DrainageKind[] = ["open_drain", "covered_drain"];
export const SPOT_DRAIN_KINDS: readonly DrainageKind[] = ["culvert", "outfall", "inlet", "retention_pond"];

export function isLineKind(kind: DrainageKind): boolean {
  return LINE_DRAIN_KINDS.includes(kind);
}

export const DRAINAGE_KIND_LABEL: Record<DrainageKind, string> = {
  open_drain: "Open drain or channel",
  covered_drain: "Covered drain",
  culvert: "Culvert",
  outfall: "Outfall (where a drain empties)",
  inlet: "Inlet or gully",
  retention_pond: "Retention pond or basin",
};

export type ConditionTone = "good" | "warn" | "bad";

/** What an inspection can find, in the words a person on site would use. */
export const CONDITION_INFO: Record<DrainageCondition, { label: string; meaning: string; tone: ConditionTone }> = {
  clear: { label: "Clear", meaning: "Water flows freely", tone: "good" },
  partly_blocked: { label: "Partly blocked", meaning: "Silt, rubbish or plants slow the water", tone: "warn" },
  blocked: { label: "Blocked", meaning: "Water can't get through", tone: "bad" },
  overflowing: { label: "Overflowing", meaning: "Water is spilling over the sides", tone: "bad" },
  damaged: { label: "Damaged", meaning: "Broken, collapsed or washed out", tone: "bad" },
};

/** The badge colour for a condition's tone (the shared Badge's own names). */
export const CONDITION_BADGE_TONE: Record<ConditionTone, "success" | "warning" | "danger"> = { good: "success", warn: "warning", bad: "danger" };

/** The conditions that mean water is not getting through. Mirrors needsAttention on the server. */
export function needsAttention(condition: DrainageCondition): boolean {
  return CONDITION_INFO[condition].tone === "bad";
}

export { DRAINAGE_CONDITIONS };

/** "Aba Road drain", or its kind when nobody named it. */
export function drainTitle(drain: { name: string | null; kind: DrainageKind }): string {
  return drain.name?.trim() || DRAINAGE_KIND_LABEL[drain.kind];
}

export interface TargetInfo {
  /** The heading of the recorder: "Recording a flood". */
  title: string;
  /** One line on what to do. */
  howTo: string;
  /** The fewest points that make a shape. */
  minPoints: number;
  /** The most points it can have (a spot is one). */
  maxPoints: number;
  /** The shape closes into an area; otherwise it is a path or a spot. */
  closes: boolean;
}

export const TARGET_INFO: Record<SurveyTarget, TargetInfo> = {
  flood: {
    title: "Recording a flood",
    howTo: "Walk around the edge of the water, or tap its edge on the map. The ring closes itself when you finish.",
    minPoints: 3,
    maxPoints: Number.POSITIVE_INFINITY,
    closes: true,
  },
  "drain-line": {
    title: "Recording a drain",
    howTo: "Walk along the drain from one end to the other, or tap along it on the map.",
    minPoints: 2,
    maxPoints: Number.POSITIVE_INFINITY,
    closes: false,
  },
  "drain-spot": {
    title: "Marking a drainage point",
    howTo: "Stand at the culvert, outfall, inlet or pond and mark it here, or tap its spot on the map.",
    minPoints: 1,
    maxPoints: 1,
    closes: false,
  },
};

/** The shortest the recorder will let a path be before it offers Finish. */
export function canFinish(target: SurveyTarget, pointCount: number): boolean {
  return pointCount >= TARGET_INFO[target].minPoints;
}

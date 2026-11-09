/**
 * Every AI feature, by name. The single source of truth: a feature's name is its key in the
 * usage log, the credit price list and the per-feature model map, and the client mirrors it in
 * client/src/types/ai.types.ts.
 */
export const AI_FEATURES = ["flood_outlook_draft", "alert_draft"] as const satisfies readonly string[];
export type AiFeature = (typeof AI_FEATURES)[number];

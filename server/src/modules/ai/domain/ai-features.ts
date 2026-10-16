/**
 * Every AI feature, by name. The single source of truth: a feature's name is its key in the
 * usage log, the credit price list and the per-feature model map, and the client mirrors it in
 * client/src/types/ai.types.ts.
 *
 * Empty until the first features are chosen (docs/ai-integration.md, "Phase 3"). Add each one
 * here as `"<thing>_draft"` when it is built.
 */
export const AI_FEATURES = [] as const satisfies readonly string[];
export type AiFeature = (typeof AI_FEATURES)[number];

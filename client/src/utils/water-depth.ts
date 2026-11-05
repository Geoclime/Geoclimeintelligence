import type { WaterDepth } from "../types/flood-report.types";

/** Water depth as a person can judge it, with a rough measure in metres. */
export const WATER_DEPTH_INFO: Record<WaterDepth, { label: string; description: string; metres: string }> = {
  ankle: { label: "Ankle-deep", description: "Water is up to the ankle", metres: "about 0.1–0.3 m" },
  knee: { label: "Knee-deep", description: "Water reaches the knee", metres: "about 0.4–0.6 m" },
  waist: { label: "Waist-deep", description: "Water is at waist level", metres: "about 0.7–1.0 m" },
  chest: { label: "Chest-deep", description: "Water reaches the chest", metres: "about 1.0–1.5 m" },
  impassable: { label: "Impassable", description: "The area is fully submerged; no crossing is possible", metres: "over 1.5 m" },
};

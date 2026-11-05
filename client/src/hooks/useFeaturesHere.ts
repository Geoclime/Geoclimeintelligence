import { useCallback, useState } from "react";
import type { ClickedFeature } from "../types/map-layer.types";
import { featuresHere, type FeatureHere } from "../utils/map-features";

/** The road and waterway under the last click on the map, for the "click anywhere" popup's "Here" lines. */
export function useFeaturesHere() {
  const [here, setHere] = useState<FeatureHere[]>([]);
  const show = useCallback((clicked: readonly ClickedFeature[]) => setHere(featuresHere(clicked)), []);
  return { here, show };
}

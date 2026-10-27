import type { OverlayLayerId } from "../types/map-layer.types";

interface HintInput {
  zoom: number;
  /** The reply said more features were in view than one response may hold. */
  truncated: boolean;
  /** How many features the layer holds in total; null until the layer list has loaded. */
  featureCount: number | null;
}

/**
 * The small line under a layer's checkbox. An empty layer says so, so a ticked box with nothing
 * on the map is never a mystery; a thinned layer says how to see the rest. The zoom steps match
 * what the server sends (server/src/modules/map-layers/layer-rules.ts): every road type from
 * zoom 14, every waterway from zoom 11, every facility type from zoom 12. The zoom is rounded first, as useMapLayer rounds the
 * zoom it sends, so the hint and the reply always agree.
 */
export function overlayHint(layer: OverlayLayerId, { zoom, truncated, featureCount }: HintInput): string | undefined {
  if (featureCount === 0) return "No data loaded yet";
  if (truncated) return "Too many here to show: zoom in";
  const sentZoom = Math.round(zoom);
  if (layer === "roads" && sentZoom < 14) return "Smaller roads appear as you zoom in";
  if (layer === "waterways" && sentZoom < 11) return "Creeks and small water appear as you zoom in";
  if (layer === "infrastructure" && sentZoom < 12) return "Health and police first: more appear as you zoom in";
  return undefined;
}

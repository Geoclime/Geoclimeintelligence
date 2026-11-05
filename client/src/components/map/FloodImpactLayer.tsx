import type { FeatureCollection } from "geojson";
import { Layer, Source } from "react-map-gl/mapbox";
import { useFloodImpactFeatures } from "../../hooks/useSurveyDetails";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
/** One colour for everything a flood reaches: amber, apart from the flood's magenta, the water's blue and the drains' tones. */
const IMPACT = "#f79009";

interface FloodImpactLayerProps {
  /** The flood whose reach to draw; null draws nothing. */
  floodId: string | null;
}

/**
 * What a selected flood reaches, drawn over it: the buildings it touches outlined, the stretches of
 * road under it thickened, and the facilities inside ringed. The same counts as its popup, as shapes.
 * Always mounted, so its place in the draw order never changes; empty while no flood is chosen.
 */
export function FloodImpactLayer({ floodId }: FloodImpactLayerProps) {
  const data = useFloodImpactFeatures(floodId);
  const shown = floodId && data ? data : EMPTY;
  return (
    <Source id="flood-impact" type="geojson" data={shown}>
      <Layer id="flood-impact-buildings" type="fill" filter={["==", ["get", "kind"], "building"]} paint={{ "fill-color": IMPACT, "fill-opacity": 0.45, "fill-outline-color": IMPACT }} />
      <Layer
        id="flood-impact-roads"
        type="line"
        filter={["==", ["get", "kind"], "road"]}
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": IMPACT, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 16, 8], "line-opacity": 0.85 }}
      />
      <Layer
        id="flood-impact-facilities"
        type="circle"
        filter={["==", ["get", "kind"], "facility"]}
        paint={{ "circle-color": "rgba(0,0,0,0)", "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 7, 16, 13], "circle-stroke-color": IMPACT, "circle-stroke-width": 3 }}
      />
    </Source>
  );
}

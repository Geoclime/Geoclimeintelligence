import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import type { LonLat } from "../../types/admin-unit.types";
import type { MapPalette } from "./map-style";

/** A dashed straight line between two places: from "you are here" to the pinned flood report, to follow by eye. */
export function TraceLineLayer({ from, to, palette }: { from: LonLat; to: LonLat; palette: MapPalette }) {
  const data = useMemo(
    () => ({ type: "FeatureCollection" as const, features: [{ type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: [from, to] }, properties: {} }] }),
    [from, to],
  );

  return (
    <Source id="trace-line" type="geojson" data={data}>
      <Layer
        id="trace-line-dashes"
        type="line"
        layout={{ "line-cap": "round" }}
        paint={{ "line-color": palette.selected, "line-width": 2.5, "line-opacity": 0.9, "line-dasharray": [1.2, 2] }}
      />
    </Source>
  );
}

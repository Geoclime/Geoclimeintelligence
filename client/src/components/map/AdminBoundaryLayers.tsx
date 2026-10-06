import type { FeatureCollection, Point } from "geojson";
import { memo, useMemo } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import type { AdminUnitFeatureCollection, AdminUnitSummary } from "../../types/admin-unit.types";
import { boundaryLayers, type MapPalette } from "./map-style";

interface AdminBoundaryLayersProps {
  palette: MapPalette;
  state: AdminUnitFeatureCollection | null;
  lgas: AdminUnitFeatureCollection | null;
  wards: AdminUnitFeatureCollection | null;
  /** LGA list rows (no shapes); their centroids place the LGA name labels. */
  lgaLabels: AdminUnitSummary[];
  selectedLgaId: string | null;
}

/**
 * The state outline, LGA boundaries and names, and ward boundaries, as native Mapbox sources and
 * layers (standard section 10: never React markers for a whole layer). Each layer only renders
 * once its data has arrived, so nothing is drawn from placeholder data.
 */
export const AdminBoundaryLayers = memo(function AdminBoundaryLayers({
  palette,
  state,
  lgas,
  wards,
  lgaLabels,
  selectedLgaId,
}: AdminBoundaryLayersProps) {
  const layers = useMemo(() => boundaryLayers(palette, selectedLgaId), [palette, selectedLgaId]);

  const labels = useMemo<FeatureCollection<Point, { id: string; unitName: string }>>(
    () => ({
      type: "FeatureCollection",
      features: lgaLabels.map((unit) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: unit.centroid },
        properties: { id: unit.id, unitName: unit.unitName },
      })),
    }),
    [lgaLabels],
  );

  return (
    <>
      {wards && (
        <Source id="wards" type="geojson" data={wards}>
          <Layer {...layers.wardFill} />
          <Layer {...layers.wardLine} />
        </Source>
      )}
      {lgas && (
        <Source id="lgas" type="geojson" data={lgas}>
          <Layer {...layers.lgaFill} />
          <Layer {...layers.lgaLine} />
          <Layer {...layers.lgaSelected} />
        </Source>
      )}
      {state && (
        <Source id="state" type="geojson" data={state}>
          <Layer {...layers.state} />
        </Source>
      )}
      {lgas && labels.features.length > 0 && (
        <Source id="lga-labels" type="geojson" data={labels}>
          <Layer {...layers.lgaLabels} />
        </Source>
      )}
    </>
  );
});

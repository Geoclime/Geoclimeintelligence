import type { FeatureCollection } from "geojson";
import { memo, useEffect, useMemo } from "react";
import { Layer, Source, useMap } from "react-map-gl/mapbox";
import type { GeoJSONSource } from "mapbox-gl";
import type { DrainageFeatureCollection, FloodExtentFeatureCollection, SurveyTarget } from "../../types/field-survey.types";
import type { LonLat } from "../../types/admin-unit.types";
import { drainsForDisplay } from "../../utils/drain-display";
import { surveyDraftGeoJson } from "../../utils/survey-draft-geojson";
import { DrainageIcons } from "./DrainageIcons";
import type { MapPalette } from "./map-style";
import { DRAIN_CLUSTER_LAYER, draftLayers, drainClusterLayers, surveyLayers } from "./survey-style";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/** Spots are clustered up to this zoom, so a zoomed-out view shows "12 drains, 3 need attention" instead of a smear. */
const CLUSTER_MAX_ZOOM = 13;

interface SurveyLayersProps {
  palette: MapPalette;
  floods: FloodExtentFeatureCollection | null;
  drains: DrainageFeatureCollection | null;
}

/**
 * The floods and drains responders recorded. Like the facility layers, both sources are always
 * mounted (empty until their data arrives, or while switched off), so the draw order never changes:
 * drains over floods, both over the other overlays and under the boundary lines.
 */
export const SurveyLayers = memo(function SurveyLayers({ palette, floods, drains }: SurveyLayersProps) {
  const layers = useMemo(() => surveyLayers(palette), [palette]);
  return (
    <>
      <Source id="flood-extents" type="geojson" data={floods ?? EMPTY}>
        <Layer {...layers.floodFill} />
        <Layer {...layers.floodLine} />
        <Layer {...layers.floodRecededLine} />
      </Source>
      <DrainageLayers palette={palette} drains={drains} />
    </>
  );
});

/**
 * Drainage as every map draws it (the main map, and an LGA's or ward's): lines with their casing,
 * dashes for covered drains and arrows for the way water flows, and spots as shapes, clustered when
 * zoomed out. Each drain is first marked with its tone and whether its last check is stale.
 */
export function DrainageLayers({ palette, drains, cluster = true }: { palette: MapPalette; drains: DrainageFeatureCollection | null; cluster?: boolean }) {
  const layers = useMemo(() => surveyLayers(palette), [palette]);
  const clusters = useMemo(() => drainClusterLayers(palette), [palette]);
  // Staleness is judged when the data arrives; a drain going stale while the page is open is not worth a timer.
  const shown = useMemo(() => drainsForDisplay(drains), [drains]);
  const lines = useMemo<FeatureCollection>(
    () => (shown ? { type: "FeatureCollection", features: shown.features.filter((f) => f.geometry.type === "LineString") } : EMPTY),
    [shown],
  );
  const spots = useMemo<FeatureCollection>(
    () => (shown ? { type: "FeatureCollection", features: shown.features.filter((f) => f.geometry.type === "Point") } : EMPTY),
    [shown],
  );
  return (
    <>
      <DrainageIcons />
      <Source id="drainage" type="geojson" data={lines}>
        <Layer {...layers.drainHit} />
        <Layer {...layers.drainCasing} />
        <Layer {...layers.drainLine} />
        <Layer {...layers.drainCovered} />
        <Layer {...layers.drainArrows} />
      </Source>
      <Source
        id="drainage-spots"
        type="geojson"
        data={spots}
        cluster={cluster}
        clusterMaxZoom={CLUSTER_MAX_ZOOM}
        clusterRadius={40}
        clusterProperties={{
          bad: ["+", ["case", ["==", ["get", "tone"], "bad"], 1, 0]],
          warn: ["+", ["case", ["==", ["get", "tone"], "warn"], 1, 0]],
        }}
      >
        <Layer {...clusters.circles} />
        <Layer {...clusters.counts} />
        <Layer {...layers.drainPoints} />
      </Source>
      {cluster && <ClusterZoom />}
    </>
  );
}

/** A tap on a cluster zooms in until it comes apart. */
function ClusterZoom() {
  const { current } = useMap();
  useEffect(() => {
    const map = current?.getMap();
    if (!map) return;
    const onClick = (event: { features?: { properties: Record<string, unknown> | null; geometry: { type: string; coordinates?: unknown } }[] }) => {
      const feature = event.features?.[0];
      const clusterId = feature?.properties?.cluster_id;
      const source = map.getSource("drainage-spots") as GeoJSONSource | undefined;
      if (typeof clusterId !== "number" || !source || feature?.geometry.type !== "Point") return;
      const center = feature.geometry.coordinates as [number, number];
      source.getClusterExpansionZoom(clusterId, (error, zoom) => {
        if (!error && typeof zoom === "number") map.easeTo({ center, zoom: zoom + 0.5 });
      });
    };
    map.on("click", DRAIN_CLUSTER_LAYER, onClick);
    return () => {
      map.off("click", DRAIN_CLUSTER_LAYER, onClick);
    };
  }, [current]);
  return null;
}

interface SurveyDraftLayerProps {
  palette: MapPalette;
  target: SurveyTarget | null;
  points: readonly LonLat[];
  /** Where the device is now, shown while walking. */
  me: LonLat | null;
}

/** The walk in progress, over everything else: its ring or path, a dot for each point, and where you stand. */
export function SurveyDraftLayer({ palette, target, points, me }: SurveyDraftLayerProps) {
  const layers = useMemo(() => draftLayers(palette), [palette]);
  const data = useMemo(() => surveyDraftGeoJson(target, points, me), [target, points, me]);
  return (
    <Source id="survey-draft" type="geojson" data={data}>
      <Layer {...layers.draftFill} />
      <Layer {...layers.draftOutline} />
      <Layer {...layers.draftVertices} />
      <Layer {...layers.draftMe} />
    </Source>
  );
}

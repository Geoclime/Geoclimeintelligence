import type { FeatureCollection, Geometry } from "geojson";
import { memo, useMemo } from "react";
import { Layer, Source, type LayerProps } from "react-map-gl/mapbox";
import type { AdminUnitFeatureCollection } from "../../types/admin-unit.types";
import { PREDICTION_RISK_INFO, type FloodPrediction } from "../../types/flood-prediction.types";

interface FloodPredictionLayerProps {
  visible: boolean;
  lgas: AdminUnitFeatureCollection | null;
  predictions: FloodPrediction[];
}

export const FLOOD_PREDICTION_LEGEND = [
  { key: "pred-severe", label: "Forecast: Severe flood risk", swatch: "color", color: PREDICTION_RISK_INFO.severe.color },
  { key: "pred-warning", label: "Forecast: Flood warning", swatch: "color", color: PREDICTION_RISK_INFO.warning.color },
  { key: "pred-watch", label: "Forecast: Flood watch", swatch: "color", color: PREDICTION_RISK_INFO.watch.color },
  { key: "pred-normal", label: "Forecast: Normal", swatch: "color", color: PREDICTION_RISK_INFO.normal.color },
];

export const FLOOD_PREDICTION_NOTE =
  "7-day flood forecast (Modelled): combines Open-Meteo & GloFAS river discharge with local terrain susceptibility and recorded drainage status.";

export const FloodPredictionLayer = memo(function FloodPredictionLayer({
  visible,
  lgas,
  predictions,
}: FloodPredictionLayerProps) {
  const byId = useMemo(() => new Map(predictions.map((p) => [p.adminUnit.id, p])), [predictions]);

  const data = useMemo<FeatureCollection<Geometry, { id: string; riskLevel: string; score: number }> | null>(() => {
    if (!lgas) return null;
    return {
      type: "FeatureCollection",
      features: lgas.features.map((f) => {
        const pred = byId.get(f.properties.id);
        return {
          type: "Feature",
          geometry: f.geometry,
          properties: {
            id: f.properties.id,
            riskLevel: pred?.riskLevel ?? "normal",
            score: pred?.likelihoodScore ?? 0,
          },
        };
      }),
    };
  }, [lgas, byId]);

  if (!visible || !data) return null;

  const fillLayer: LayerProps = {
    id: "flood-prediction-fill",
    type: "fill",
    paint: {
      "fill-color": [
        "match",
        ["get", "riskLevel"],
        "severe",
        PREDICTION_RISK_INFO.severe.color,
        "warning",
        PREDICTION_RISK_INFO.warning.color,
        "watch",
        PREDICTION_RISK_INFO.watch.color,
        PREDICTION_RISK_INFO.normal.color,
      ],
      "fill-opacity": [
        "match",
        ["get", "riskLevel"],
        "severe",
        0.42,
        "warning",
        0.34,
        "watch",
        0.26,
        0.12,
      ],
    },
  };

  const lineLayer: LayerProps = {
    id: "flood-prediction-line",
    type: "line",
    paint: {
      "line-color": [
        "match",
        ["get", "riskLevel"],
        "severe",
        PREDICTION_RISK_INFO.severe.color,
        "warning",
        PREDICTION_RISK_INFO.warning.color,
        "watch",
        PREDICTION_RISK_INFO.watch.color,
        PREDICTION_RISK_INFO.normal.color,
      ],
      "line-width": 2,
      "line-opacity": 0.85,
    },
  };

  return (
    <Source id="flood-prediction" type="geojson" data={data}>
      <Layer {...fillLayer} />
      <Layer {...lineLayer} />
    </Source>
  );
});

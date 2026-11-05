import type { AdminUnitRef } from "./admin-unit.types";
import type { DataSource } from "./data-source.types";

// Mirrors server/src/modules/flood-risk/flood-risk.types.ts.

/** Mapbox image-source order: top-left, top-right, bottom-right, bottom-left, each [longitude, latitude]. */
export type ImageCorners = [[number, number], [number, number], [number, number], [number, number]];

export type FloodRiskLayerStatus = "staged" | "live" | "retired";

export interface FloodRiskClass {
  /** 1 (very low) to 5 (very high). */
  value: number;
  label: string;
  /** The colour painted into the picture, so the legend matches it exactly. */
  color: string;
  areaKm2: number;
}

/** GET /api/v1/flood-risk: the map the home screen draws, with what its legend and credit line need. */
export interface FloodRiskLayer {
  id: string;
  countryCode: string;
  status: FloodRiskLayerStatus;
  /** DERIVED: a modelled judgement of where it could flood, never an observation. */
  dataType: string;
  title: string;
  coordinates: ImageCorners;
  image: { width: number; height: number };
  cellSizeMetres: number;
  sourceCrs: string;
  classes: FloodRiskClass[];
  totalAreaKm2: number;
  source: DataSource;
  promotedAt: string | null;
  createdAt: string;
}

export interface AreaFloodRiskClass extends FloodRiskClass {
  /** Share of the area's classified cells, 0 to 100. */
  percent: number;
}

/** GET /api/v1/flood-risk/areas/:adminUnitId: how at risk one LGA or ward is. */
export interface AreaFloodRisk {
  layerId: string;
  adminUnit: AdminUnitRef;
  totalAreaKm2: number;
  classes: AreaFloodRiskClass[];
  /** Share of the area that is high or very high risk, 0 to 100. */
  percentHighOrVeryHigh: number;
  /** The mean class, 1 to 5. */
  meanClass: number;
  /** Where it stands among the areas of its level, most at risk first. */
  rank: { position: number; of: number };
}

/** GET /api/v1/flood-risk/at: the class under a point; `class` is null where the map has no data. */
export interface FloodRiskPoint {
  layerId: string;
  class: { value: number; label: string; color: string } | null;
}

/** POST /api/v1/imports/flood-risk. */
export interface StartFloodRiskImportInput {
  file: File;
  countryCode: string;
  sourceId: string;
  title?: string;
}

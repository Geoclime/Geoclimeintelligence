import type { AdminUnitRef } from "./admin-unit.types";
import type { DataSource } from "./data-source.types";
import type { ImageCorners } from "./flood-risk.types";

// Mirrors server/src/modules/satellite-flood/satellite-flood.types.ts.

export type SatelliteFloodLayerStatus = "staged" | "live" | "retired";

/** One month of water seen from space, as the map and the review screen need it. */
export interface SatelliteFloodLayer {
  id: string;
  countryCode: string;
  status: SatelliteFloodLayerStatus;
  /** DERIVED: radar observed, water inferred by a threshold. */
  dataType: string;
  /** "YYYY-MM". */
  yearMonth: string;
  title: string;
  coordinates: ImageCorners;
  image: { width: number; height: number };
  zoom: number;
  /** Roughly how many metres a pixel of the picture is. */
  pixelMetres: number;
  /** The colour painted into the picture, so the legend matches it. */
  colour: string;
  /** Water inside the LGAs, and the part of the LGAs the tiles cover. */
  floodedKm2: number;
  coveredKm2: number;
  percentFlooded: number;
  source: DataSource;
  promotedAt: string | null;
  createdAt: string;
}

/** GET /api/v1/satellite-floods?countryCode=: every live month, newest first. */
export interface SatelliteFloodList {
  countryCode: string;
  months: SatelliteFloodLayer[];
}

export interface AreaSatelliteFloodMonth {
  layerId: string;
  yearMonth: string;
  floodedKm2: number;
  measuredKm2: number;
  percentFlooded: number | null;
}

/** GET /api/v1/satellite-floods/areas/:adminUnitId: one area's live months, oldest first. */
export interface AreaSatelliteFlood {
  adminUnit: AdminUnitRef;
  months: AreaSatelliteFloodMonth[];
}

/** POST /api/v1/imports/satellite-flood: one month's tiles. The month is read from the file name unless given. */
export interface StartSatelliteFloodImportInput {
  file: File;
  countryCode: string;
  sourceId: string;
  yearMonth?: string;
}

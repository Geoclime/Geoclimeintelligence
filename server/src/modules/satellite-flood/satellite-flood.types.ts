import type { MultiPolygon, Polygon } from "geojson";
import type { BBox } from "../../common/geo/geo";
import type { AdminUnitRef } from "../admin-units/admin-unit.types";
import type { DataSourceDto } from "../data-sources/data-source.types";
import type { ImageCorners } from "../flood-risk/flood-risk.types";

/** The water colour the map draws, the one in the data team's own tiles (CSS "dodgerblue"). */
export const WATER_COLOUR = "#1e90ff";

export type SatelliteFloodLayerStatus = "staged" | "live" | "retired";

/**
 * One month's flood mask, stitched from the tiles of one zoom level, on the Web Mercator pixel grid
 * of that zoom: pixel (0, 0) is the global pixel (`originX`, `originY`), rows run south.
 * `mask` holds 1 where the tiles show water and 0 elsewhere (no water seen, or no tile).
 */
export interface FloodMosaic {
  zoom: number;
  /** Tile side in pixels (256 for the data team's tiles). */
  tileSize: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  mask: Uint8Array;
  /** Pixels holding water. */
  waterPixels: number;
  /** The edges of the mosaic in WGS 84, from its pixel edges. */
  bounds: BBox;
}

/** What the file says about itself, as read from its `metadata` table and name. */
export interface TileSetInfo {
  /** The `name` entry, e.g. "s1_flood_2016_08". */
  name: string | null;
  description: string | null;
  /** "YYYY-MM" from the name or the file name; null when neither says. */
  yearMonth: string | null;
  /** The highest zoom the file holds, and the one read. */
  maxZoom: number;
  readZoom: number;
  /** Tiles read at `readZoom`. */
  tileCount: number;
}

/** The picture the map draws: a 1-bit PNG on the Web Mercator grid, and its edges in WGS 84. */
export interface MaskImage {
  png: Buffer;
  width: number;
  height: number;
  west: number;
  south: number;
  east: number;
  north: number;
}

/** A live area (LGA or ward) to measure, with its own size so coverage can be told. */
export interface AreaToMeasure {
  id: string;
  unitName: string;
  unitCode: string | null;
  level: number;
  levelName: string;
  parentName: string | null;
  /** The area's own size, from PostGIS on the spheroid. */
  areaKm2: number;
  geometry: Polygon | MultiPolygon;
}

/** How much of one area was water, and how much of it the tiles cover. */
export interface AreaWater {
  floodedKm2: number;
  measuredKm2: number;
}

/**
 * The cleaned values for one satellite flood row, stored in import_staging_rows.fields: one row per
 * LGA and ward, with how much of it was water that month.
 */
export interface SatelliteFloodStagedFields {
  adminUnitId: string;
  unitName: string;
  unitCode: string | null;
  levelName: string;
  parentName: string | null;
  yearMonth: string;
  floodedKm2: number;
  /** The part of the area the tiles cover. */
  measuredKm2: number;
  areaKm2: number;
  /** Water as a share of the measured part, 0 to 100; null when the tiles don't reach the area. */
  percentFlooded: number | null;
}

/** Everything the import writes for the month itself, in the run's transaction. */
export interface NewSatelliteFloodLayer {
  kind: "satellite_flood";
  countryCode: string;
  sourceId: string;
  yearMonth: string;
  title: string;
  zoom: number;
  image: MaskImage;
  /** Water inside the country's top-level areas (LGAs), and the part of them the tiles cover. */
  floodedKm2: number;
  coveredKm2: number;
  createdBy: string;
}

/** A layer row without its picture, which is read on its own. */
export interface SatelliteFloodLayerRecord {
  id: string;
  countryCode: string;
  importRunId: string | null;
  sourceId: string;
  status: SatelliteFloodLayerStatus;
  dataType: string;
  yearMonth: string;
  title: string;
  zoom: number;
  imageWidth: number;
  imageHeight: number;
  west: number;
  south: number;
  east: number;
  north: number;
  floodedKm2: number;
  coveredKm2: number;
  createdAt: Date;
  promotedAt: Date | null;
}

/** One month as the map and the review screen need it. */
export interface SatelliteFloodLayerDto {
  id: string;
  countryCode: string;
  status: SatelliteFloodLayerStatus;
  /** DERIVED: radar observed, water inferred by a threshold. */
  dataType: string;
  yearMonth: string;
  title: string;
  /** Where to pin the picture: Mapbox's image-source corners. */
  coordinates: ImageCorners;
  image: { width: number; height: number };
  /** The tile zoom the mask was read at, and roughly how many metres a pixel is there. */
  zoom: number;
  pixelMetres: number;
  colour: string;
  /** Water inside the LGAs, and the part of the LGAs the tiles cover. */
  floodedKm2: number;
  coveredKm2: number;
  percentFlooded: number;
  source: DataSourceDto;
  promotedAt: string | null;
  createdAt: string;
}

/** GET /api/v1/satellite-floods?countryCode=: every live month, newest first. */
export interface SatelliteFloodListDto {
  countryCode: string;
  months: SatelliteFloodLayerDto[];
}

/** One month of one area. */
export interface AreaSatelliteFloodMonthDto {
  layerId: string;
  yearMonth: string;
  floodedKm2: number;
  measuredKm2: number;
  /** Water as a share of the measured part, 0 to 100; null when the tiles didn't reach it. */
  percentFlooded: number | null;
}

/** GET /api/v1/satellite-floods/areas/:adminUnitId: an LGA's or ward's months, oldest first. */
export interface AreaSatelliteFloodDto {
  adminUnit: AdminUnitRef;
  months: AreaSatelliteFloodMonthDto[];
}

/** What services depend on, so they can be unit-tested with an in-memory fake (section 2). */
export interface ISatelliteFloodRepository {
  findLiveByCountry(countryCode: string): Promise<SatelliteFloodLayerRecord[]>;
  findByRunId(runId: string): Promise<SatelliteFloodLayerRecord | null>;
  findLayerById(id: string): Promise<SatelliteFloodLayerRecord | null>;
  findImage(id: string): Promise<Buffer | null>;
  /** Every live LGA and ward of the country, with a lightly simplified shape and its own area. */
  findAreasToMeasure(countryCode: string): Promise<AreaToMeasure[]>;
  /** The live months of one area, oldest first. */
  findAreaMonths(adminUnitId: string): Promise<AreaSatelliteFloodMonthDto[]>;
}

import type { Polygon, MultiPolygon } from "geojson";
import type { LonLat } from "../../common/geo/geo";
import type { AdminUnitRef } from "../admin-units/admin-unit.types";
import type { DataSourceDto } from "../data-sources/data-source.types";

/**
 * The five flood risk classes of the data team's map, very low to very high. The colours are
 * ColorBrewer's "RdYlGn" five-class set, the ones on their own PNG. They are painted into the
 * picture the map draws and sent with the layer, so the legend and the picture can't disagree.
 */
export const FLOOD_RISK_CLASSES = [
  { value: 1, label: "Very low", color: "#1a9641" },
  { value: 2, label: "Low", color: "#a6d96a" },
  { value: 3, label: "Moderate", color: "#ffffbf" },
  { value: 4, label: "High", color: "#fdae61" },
  { value: 5, label: "Very high", color: "#d7191c" },
] as const;
export const CLASS_COUNT = FLOOD_RISK_CLASSES.length;

/** Cells (or area) per class, very low first. */
export type ClassCells = [number, number, number, number, number];

/** Mapbox image-source order: top-left, top-right, bottom-right, bottom-left. */
export type ImageCorners = [LonLat, LonLat, LonLat, LonLat];

export type FloodRiskLayerStatus = "staged" | "live" | "retired";

/**
 * A classified map read from a GeoTIFF: one byte per cell, 0 = no data, 1..5 = very low..very high.
 * `originE` and `originN` are the top-left corner of the top-left cell, in the raster's own UTM
 * zone (metres); rows run south, columns run east.
 */
export interface ClassRaster {
  width: number;
  height: number;
  originE: number;
  originN: number;
  /** Cell side in metres (cells are square). */
  cellSize: number;
  /** WGS 84 / UTM: 326zz north, 327zz south. */
  epsg: number;
  classes: Uint8Array;
  classCells: ClassCells;
  /** The block of cells that hold a class, inclusive. */
  block: { minCol: number; maxCol: number; minRow: number; maxRow: number };
}

/** The picture the map draws: a palette PNG on the Web Mercator grid, and its edges in WGS 84. */
export interface OverlayImage {
  png: Buffer;
  width: number;
  height: number;
  west: number;
  south: number;
  east: number;
  north: number;
}

/** A live area (LGA or ward) to count cells in. */
export interface AreaToMeasure {
  id: string;
  unitName: string;
  unitCode: string | null;
  level: number;
  levelName: string;
  parentName: string | null;
  geometry: Polygon | MultiPolygon;
}

/** One area's cell counts per class. */
export interface AreaFigures {
  adminUnitId: string;
  classCells: ClassCells;
}

/**
 * The cleaned values for one flood risk row, stored in import_staging_rows.fields: one row per
 * LGA and ward, with how many cells of each class fall inside it.
 */
export interface FloodRiskStagedFields {
  adminUnitId: string;
  unitName: string;
  unitCode: string | null;
  levelName: string;
  /** The area's parent, for a ward. */
  parentName: string | null;
  classCells: ClassCells;
  /** Cells holding a class: 0 when the map doesn't reach this area. */
  totalCells: number;
  /** The share of classified cells that are high or very high; null when there are none. */
  percentHigh: number | null;
  /** The mean class, 1 to 5; null when there are no cells. */
  meanClass: number | null;
}

/** Everything the import writes for the map itself, in the run's transaction. */
export interface NewFloodRiskLayer {
  countryCode: string;
  sourceId: string;
  title: string;
  sourceCrs: string;
  cellSize: number;
  gridWidth: number;
  gridHeight: number;
  originE: number;
  originN: number;
  /** The class grid, gzipped. */
  gridGz: Buffer;
  classCells: ClassCells;
  image: OverlayImage;
  createdBy: string;
}

/** A layer row without its picture and grid, which are read on their own. */
export interface FloodRiskLayerRecord {
  id: string;
  countryCode: string;
  importRunId: string | null;
  sourceId: string;
  status: FloodRiskLayerStatus;
  dataType: string;
  title: string;
  sourceCrs: string;
  cellSizeM: number;
  gridWidth: number;
  gridHeight: number;
  originE: number;
  originN: number;
  classCells: ClassCells;
  imageWidth: number;
  imageHeight: number;
  west: number;
  south: number;
  east: number;
  north: number;
  createdAt: Date;
  promotedAt: Date | null;
}

export interface FloodRiskClassDto {
  value: number;
  label: string;
  color: string;
  areaKm2: number;
}

/** GET /api/v1/flood-risk: the map the home screen draws, with what its legend and credit line need. */
export interface FloodRiskLayerDto {
  id: string;
  countryCode: string;
  status: FloodRiskLayerStatus;
  /** DERIVED: a modelled judgement of where it could flood, never an observation. */
  dataType: string;
  title: string;
  /** Where to pin the picture: Mapbox's image-source corners. */
  coordinates: ImageCorners;
  image: { width: number; height: number };
  cellSizeMetres: number;
  sourceCrs: string;
  classes: FloodRiskClassDto[];
  totalAreaKm2: number;
  source: DataSourceDto;
  promotedAt: string | null;
  createdAt: string;
}

export interface AreaFloodRiskClassDto extends FloodRiskClassDto {
  /** Share of the area's classified cells, 0 to 100. */
  percent: number;
}

/** GET /api/v1/flood-risk/areas/:adminUnitId: how at risk one LGA or ward is. */
export interface AreaFloodRiskDto {
  layerId: string;
  adminUnit: AdminUnitRef;
  totalAreaKm2: number;
  classes: AreaFloodRiskClassDto[];
  /** Share of the area that is high or very high risk, 0 to 100. */
  percentHighOrVeryHigh: number;
  /** The mean class, 1 to 5. */
  meanClass: number;
  /** Where it stands among the areas of its level, most at risk first (by the high and very high share). */
  rank: { position: number; of: number };
}

/** GET /api/v1/flood-risk/at: the class under a point. */
export interface FloodRiskPointDto {
  layerId: string;
  /** Null where the map has no data (open water outside the model, or beyond its edge). */
  class: { value: number; label: string; color: string } | null;
}

/** What services depend on, so they can be unit-tested with an in-memory fake (section 2). */
export interface IFloodRiskRepository {
  findLiveByCountry(countryCode: string): Promise<FloodRiskLayerRecord | null>;
  findByRunId(runId: string): Promise<FloodRiskLayerRecord | null>;
  findLayerById(id: string): Promise<FloodRiskLayerRecord | null>;
  findImage(id: string): Promise<Buffer | null>;
  findGrid(id: string): Promise<Buffer | null>;
  /** Every live LGA and ward of the country, with a lightly simplified shape, for counting cells. */
  findAreasToMeasure(countryCode: string): Promise<AreaToMeasure[]>;
  /** The cell counts of every area of one level, in the layer. */
  findFiguresAtLevel(layerId: string, level: number): Promise<AreaFigures[]>;
}

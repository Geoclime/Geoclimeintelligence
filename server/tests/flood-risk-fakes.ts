import type { Polygon } from "geojson";
import type { LonLat } from "../src/common/geo/geo";
import type { GeometryCheckContext, IImportRepository, NewImportRun, StagedRowInput } from "../src/modules/data-sources/imports/import.types";
import type {
  AreaFigures,
  AreaToMeasure,
  FloodRiskLayerRecord,
  FloodRiskStagedFields,
  IFloodRiskRepository,
  NewFloodRiskLayer,
} from "../src/modules/flood-risk/flood-risk.types";
import { utmConverter } from "../src/modules/flood-risk/raster-projection";
import { makeRunDto } from "./geo-fakes";

/** Where the fixture maps sit: a corner of Rivers State, in UTM zone 32N (about 6.74 E, 4.70 N). */
export const ORIGIN = { originE: 250000, originN: 520000 };

/**
 * A rectangle of whole raster cells, as a lon/lat polygon: columns [col0, col1) and rows [row0, row1)
 * of a raster whose top-left corner is ORIGIN and whose cells are `cell` metres.
 */
export function cellRectangle(col0: number, row0: number, col1: number, row1: number, cell = 100): Polygon {
  const converter = utmConverter(32632);
  const at = (col: number, row: number): LonLat => converter.toLonLat([ORIGIN.originE + col * cell, ORIGIN.originN - row * cell]);
  return { type: "Polygon", coordinates: [[at(col0, row0), at(col1, row0), at(col1, row1), at(col0, row1), at(col0, row0)]] };
}

let areaSequence = 0;
export function makeArea(overrides: Partial<AreaToMeasure> & Pick<AreaToMeasure, "geometry">): AreaToMeasure {
  areaSequence += 1;
  return {
    id: `40000000-0000-4000-8000-${String(areaSequence).padStart(12, "0")}`,
    unitName: `Area ${areaSequence}`,
    unitCode: null,
    level: 2,
    levelName: "LGA",
    parentName: null,
    ...overrides,
  };
}

/** Records what the flood risk import hands the pipeline, and answers like the real one. */
export class RecordingFloodRiskImports implements Pick<IImportRepository, "createCheckedRun"> {
  created?: { run: NewImportRun; rows: StagedRowInput<FloodRiskStagedFields>[]; checks: GeometryCheckContext | null; layer: NewFloodRiskLayer | null };

  async createCheckedRun(
    run: NewImportRun,
    rows: StagedRowInput<FloodRiskStagedFields>[],
    checks: GeometryCheckContext | null,
    layer: NewFloodRiskLayer | null = null,
  ) {
    this.created = { run, rows, checks, layer };
    const failed = rows.filter((row) => row.errors.length > 0).length;
    return makeRunDto({
      target: run.target,
      fileType: run.fileType,
      fileName: run.fileName,
      options: run.options,
      rowCount: rows.length,
      passedCount: rows.length - failed,
      errorCount: failed,
      promotableCount: rows.length - failed,
      warnings: run.warnings,
    });
  }
}

export function makeLayerRecord(overrides: Partial<FloodRiskLayerRecord> = {}): FloodRiskLayerRecord {
  return {
    id: "50000000-0000-4000-8000-000000000001",
    countryCode: "NGA",
    importRunId: "30000000-0000-4000-8000-000000000001",
    sourceId: "20000000-0000-4000-8000-000000000001",
    status: "live",
    dataType: "DERIVED",
    title: "flood_risk_map",
    sourceCrs: "EPSG:32632",
    cellSizeM: 100,
    gridWidth: 60,
    gridHeight: 50,
    originE: ORIGIN.originE,
    originN: ORIGIN.originN,
    classCells: [100, 200, 300, 400, 500],
    imageWidth: 120,
    imageHeight: 100,
    west: 6.74,
    south: 4.69,
    east: 6.76,
    north: 4.71,
    createdAt: new Date("2026-11-03T10:00:00.000Z"),
    promotedAt: new Date("2026-11-03T11:00:00.000Z"),
    ...overrides,
  };
}

/** Layers, pictures, grids and per-area figures, set per test. */
export class InMemoryFloodRiskRepository implements IFloodRiskRepository {
  layers: FloodRiskLayerRecord[] = [];
  images = new Map<string, Buffer>();
  grids = new Map<string, Buffer>();
  areas: AreaToMeasure[] = [];
  figures: (AreaFigures & { level: number; layerId: string })[] = [];

  async findLiveByCountry(countryCode: string) {
    return this.layers.find((l) => l.countryCode === countryCode && l.status === "live") ?? null;
  }

  async findByRunId(runId: string) {
    return this.layers.find((l) => l.importRunId === runId) ?? null;
  }

  async findLayerById(id: string) {
    return this.layers.find((l) => l.id === id) ?? null;
  }

  async findImage(id: string) {
    return this.images.get(id) ?? null;
  }

  async findGrid(id: string) {
    return this.grids.get(id) ?? null;
  }

  async findAreasToMeasure() {
    return this.areas;
  }

  async findFiguresAtLevel(layerId: string, level: number) {
    return this.figures.filter((f) => f.layerId === layerId && f.level === level).map(({ adminUnitId, classCells }) => ({ adminUnitId, classCells }));
  }
}

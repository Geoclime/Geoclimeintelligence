import type { MultiPolygon } from "geojson";
import type { BBox } from "../src/common/geo/geo";
import type {
  AdminUnitFilter,
  AdminUnitLookupRow,
  AdminUnitSummary,
  IAdminUnitRepository,
} from "../src/modules/admin-units/admin-unit.types";
import { Country } from "../src/modules/admin-units/country.entity";
import type { CountryPatch, ICountryRepository, LevelCount, NewCountry } from "../src/modules/admin-units/country.types";
import { DataSourceRecord } from "../src/modules/data-sources/data-source.entity";
import type { IDataSourceRepository, NewDataSource } from "../src/modules/data-sources/data-source.types";
import type {
  GeometryCheckContext,
  IImportRepository,
  ImportRunDto,
  NewImportRun,
  StagedRowInput,
} from "../src/modules/data-sources/imports/import.types";

// In-memory stand-ins for the Phase 2 repositories, so services run with no database. Shapes
// are never computed here; spatial behaviour is verified against PostGIS, not faked.

export const NIGERIA_BBOX: BBox = [2.5, 4.0, 14.8, 14.0];

export function makeCountry(overrides: Partial<Country> = {}): Country {
  return Object.assign(new Country(), {
    countryCode: "NGA",
    countryName: "Nigeria",
    levelNames: ["State", "LGA", "Ward"],
    bbox: NIGERIA_BBOX,
    geom: null,
    sourceId: null,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  });
}

export class InMemoryCountryRepository implements ICountryRepository {
  readonly rows = new Map<string, Country>();
  counts: LevelCount[] = [];

  constructor(countries: Country[] = []) {
    for (const country of countries) this.rows.set(country.countryCode, country);
  }

  async findAll() {
    return [...this.rows.values()];
  }

  async findByCode(code: string) {
    return this.rows.get(code) ?? null;
  }

  async create(input: NewCountry) {
    const country = makeCountry(input);
    this.rows.set(country.countryCode, country);
    return country;
  }

  async update(code: string, patch: CountryPatch) {
    const country = this.rows.get(code);
    if (!country) return null;
    Object.assign(country, patch);
    return country;
  }

  async countUnitsByLevel(codes: string[]) {
    return this.counts.filter((c) => codes.includes(c.countryCode));
  }
}

let unitSequence = 0;

export function makeUnit(overrides: Partial<AdminUnitLookupRow> = {}): AdminUnitLookupRow {
  unitSequence += 1;
  return {
    id: `10000000-0000-4000-8000-${String(unitSequence).padStart(12, "0")}`,
    countryCode: "NGA",
    level: 2,
    levelName: "LGA",
    unitName: `Area ${unitSequence}`,
    unitCode: null,
    parentId: null,
    ...overrides,
  };
}

const SQUARE: MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [[[[7, 4.8], [7.01, 4.8], [7.01, 4.81], [7, 4.81], [7, 4.8]]]],
};

/** Holds lookup rows only; geometry-backed queries return fixed, obviously-fake answers. */
export class InMemoryAdminUnitRepository implements IAdminUnitRepository {
  constructor(readonly units: AdminUnitLookupRow[] = []) {}

  private summary(unit: AdminUnitLookupRow): AdminUnitSummary {
    return {
      ...unit,
      sourceId: "20000000-0000-4000-8000-000000000001",
      childCount: this.units.filter((u) => u.parentId === unit.id).length,
      bbox: [7, 4.8, 7.01, 4.81],
      centroid: [7.005, 4.805],
    };
  }

  async findSummaries(filter: AdminUnitFilter) {
    const items = this.units
      .filter((u) => (filter.level === undefined || u.level === filter.level) && (!filter.parentId || u.parentId === filter.parentId))
      .map((u) => this.summary(u));
    return { items, meta: { page: filter.page, pageSize: filter.pageSize, total: items.length } };
  }

  async findSummaryById(id: string) {
    const unit = this.units.find((u) => u.id === id);
    return unit ? this.summary(unit) : null;
  }

  async findGeometry(id: string) {
    return this.units.some((u) => u.id === id) ? SQUARE : null;
  }

  /** Containment is faked by an explicit answer list, set per test. */
  containing: AdminUnitLookupRow[] = [];
  async findContaining() {
    return this.containing;
  }

  async findGeoJson() {
    return { type: "FeatureCollection" as const, features: [] };
  }

  async findLookupRows(countryCode: string, level: number) {
    return this.units.filter((u) => u.countryCode === countryCode && u.level === level);
  }

  async exists(id: string) {
    return this.units.some((u) => u.id === id);
  }

  async isDescendantOrSelf() {
    return false;
  }

  async subtreeIds() {
    return [];
  }
}

export function makeSource(overrides: Partial<DataSourceRecord> = {}): DataSourceRecord {
  return Object.assign(new DataSourceRecord(), {
    id: "20000000-0000-4000-8000-000000000001",
    provider: "geoBoundaries",
    datasetName: "gbOpen NGA ADM2",
    url: "https://www.geoboundaries.org",
    license: "CC BY 4.0",
    downloadedOn: "2026-09-22",
    notes: null,
    createdBy: null,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  });
}

export class InMemoryDataSourceRepository implements IDataSourceRepository {
  constructor(readonly rows: DataSourceRecord[] = []) {}

  async findById(id: string) {
    return this.rows.find((s) => s.id === id) ?? null;
  }

  async findPage() {
    return { items: this.rows, meta: { page: 1, pageSize: 25, total: this.rows.length } };
  }

  async create(input: NewDataSource) {
    const source = makeSource({ ...input, id: `20000000-0000-4000-8000-${String(this.rows.length + 2).padStart(12, "0")}` });
    this.rows.push(source);
    return source;
  }
}

/** Records what the service asked it to store; runs are reported as all rows passed unless they had JS-side errors. */
export class RecordingImportRepository implements IImportRepository {
  created?: { run: NewImportRun; rows: StagedRowInput[]; checks: GeometryCheckContext };
  runs = new Map<string, ImportRunDto>();
  promoteCalls = 0;

  async createCheckedRun(run: NewImportRun, rows: StagedRowInput[], checks: GeometryCheckContext) {
    this.created = { run, rows, checks };
    const failed = rows.filter((r) => r.errors.length > 0).length;
    const dto = makeRunDto({ rowCount: rows.length, passedCount: rows.length - failed, errorCount: failed });
    this.runs.set(dto.id, dto);
    return dto;
  }

  async findRunById(id: string) {
    return this.runs.get(id) ?? null;
  }

  async findRunPage() {
    return { items: [...this.runs.values()], meta: { page: 1, pageSize: 25, total: this.runs.size } };
  }

  async findRowPage() {
    return { items: [], meta: { page: 1, pageSize: 25, total: 0 } };
  }

  async findRunGeoJson() {
    return { type: "FeatureCollection" as const, features: [] };
  }

  async promoteAdminUnits(runId: string) {
    this.promoteCalls += 1;
    const run = this.runs.get(runId)!;
    Object.assign(run, { status: "promoted", promotedCount: run.passedCount });
    return run.passedCount;
  }
}

export function makeRunDto(overrides: Partial<ImportRunDto> = {}): ImportRunDto {
  return {
    id: "30000000-0000-4000-8000-000000000001",
    target: "admin_units",
    fileName: "lgas.xlsx",
    fileType: "xlsx",
    sheetName: "lga_boundaries",
    options: { countryCode: "NGA", level: 2, levelName: "LGA", parentId: null },
    columnMapping: {},
    source: { id: "20000000-0000-4000-8000-000000000001", provider: "geoBoundaries", datasetName: "gbOpen" },
    status: "checked",
    rowCount: 0,
    passedCount: 0,
    errorCount: 0,
    promotedCount: null,
    warnings: [],
    extent: null,
    createdBy: { id: "00000000-0000-4000-8000-000000000001", email: null, displayName: null },
    createdAt: "2026-10-05T10:00:00.000Z",
    promotedBy: null,
    promotedAt: null,
    ...overrides,
  };
}

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
  AdminUnitStagedFields,
  GeometryCheckContext,
  IImportRepository,
  ImportRunDto,
  NewImportRun,
  RainfallStagedFields,
  StagedRowInput,
} from "../src/modules/data-sources/imports/import.types";
import type { IRainfallRepository, LiveRainfallValue, RainfallMonthRow } from "../src/modules/rainfall/rainfall.types";

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

  /** Users scoped to each "CODE|level", for the clear-a-level checks. */
  scopedUsers = new Map<string, number>();

  async countUsersScopedToLevel(code: string, level: number) {
    return this.scopedUsers.get(`${code}|${level}`) ?? 0;
  }

  async deleteLevel(code: string, level: number) {
    if (this.counts.some((c) => c.countryCode === code && c.level === level + 1 && c.count > 0)) return 0;
    if ((this.scopedUsers.get(`${code}|${level}`) ?? 0) > 0) return null;
    const deleted = this.counts.find((c) => c.countryCode === code && c.level === level)?.count ?? 0;
    this.counts = this.counts.filter((c) => !(c.countryCode === code && c.level === level));
    return deleted;
  }

  async deleteIfEmpty(code: string) {
    if (this.counts.some((c) => c.countryCode === code && c.count > 0)) return false;
    return this.rows.delete(code);
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
    const needle = filter.q?.toLowerCase();
    const items = this.units
      .filter((u) => (filter.level === undefined || u.level === filter.level) && (!filter.parentId || u.parentId === filter.parentId))
      .filter((u) => !needle || u.unitName.toLowerCase().includes(needle))
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
  /** `inUse` holds the ids of sources that something still references (the foreign keys refuse those). */
  constructor(readonly rows: DataSourceRecord[] = [], readonly inUse: Set<string> = new Set()) {}

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

  async deleteIfUnused(id: string) {
    const index = this.rows.findIndex((s) => s.id === id);
    if (index < 0 || this.inUse.has(id)) return false;
    this.rows.splice(index, 1);
    return true;
  }
}

/** Records what the service asked it to store; runs are reported as all rows passed unless they had JS-side errors. */
export class RecordingImportRepository implements IImportRepository {
  /** Rows of an admin-units run; a rainfall run's rows are in `createdRainfall` instead. */
  created?: { run: NewImportRun; rows: StagedRowInput[]; checks: GeometryCheckContext | null };
  createdRainfall?: { run: NewImportRun; rows: StagedRowInput<RainfallStagedFields>[] };
  runs = new Map<string, ImportRunDto>();
  promoteCalls = 0;

  async createCheckedRun(
    run: NewImportRun,
    rows: StagedRowInput<AdminUnitStagedFields>[] | StagedRowInput<RainfallStagedFields>[],
    checks: GeometryCheckContext | null,
  ) {
    if (run.target === "rainfall_observations") this.createdRainfall = { run, rows: rows as StagedRowInput<RainfallStagedFields>[] };
    else this.created = { run, rows: rows as StagedRowInput[], checks };
    const failed = rows.filter((r) => r.errors.length > 0).length;
    const passed = rows.length - failed;
    const unchanged = rows.filter((r) => r.errors.length === 0 && "change" in r.fields && r.fields.change === "unchanged").length;
    const dto = makeRunDto({
      target: run.target,
      rowCount: rows.length,
      passedCount: passed,
      errorCount: failed,
      promotableCount: passed - unchanged,
    });
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

  async promote(runId: string) {
    this.promoteCalls += 1;
    const run = this.runs.get(runId)!;
    const written = run.promotableCount ?? run.passedCount;
    Object.assign(run, { status: "promoted", promotedCount: written });
    return written;
  }
}

/** Live rainfall months, set per test; `series` holds each area's months for the read endpoint. */
export class InMemoryRainfallRepository implements IRainfallRepository {
  constructor(
    readonly values: LiveRainfallValue[] = [],
    readonly series: Map<string, RainfallMonthRow[]> = new Map(),
  ) {}

  async findLiveValues() {
    return this.values;
  }

  async findSeries(adminUnitId: string, range: { from?: string; to?: string }) {
    return (this.series.get(adminUnitId) ?? []).filter(
      (row) => (!range.from || row.yearMonth >= range.from) && (!range.to || row.yearMonth <= range.to),
    );
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
    promotableCount: null,
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

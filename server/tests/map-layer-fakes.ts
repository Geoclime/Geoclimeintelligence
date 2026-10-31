import { ValidationError } from "../src/common/errors/app-error";
import type {
  BatchContext,
  BatchResult,
  BuildingRow,
  EnsuredSource,
  ILayerLoadStore,
  InfrastructureRow,
  LayerLoadTx,
  NewLayerSource,
  RoadRow,
  WardBatchContext,
  SettlementRow,
  WaterwayRow,
} from "../src/modules/map-layers/map-layer-loader.types";
import type { FacilityOrigin } from "../src/modules/map-layers/layer-rules";
import type {
  BuildingFeatureCollection,
  FacilityChanges,
  FacilityDto,
  IBuildingRepository,
  IFacilityRepository,
  IInfrastructureRepository,
  InfrastructureFeatureCollection,
  IRoadRepository,
  ISettlementRepository,
  IWaterwayRepository,
  LayerGeoJsonQuery,
  LayerSummary,
  ManualFacilitySource,
  NewFacility,
  RoadFeatureCollection,
  SettlementFeatureCollection,
  WaterwayFeatureCollection,
} from "../src/modules/map-layers/map-layer.types";

// In-memory stand-ins for the map-layer repositories, so services run with no database. Shapes
// and SQL are never computed here; the spatial SQL is verified against PostGIS, not faked.

/** Remembers the query it was given and returns an empty, untruncated layer. */
export class RecordingLayerRepository implements IRoadRepository, IWaterwayRepository, ISettlementRepository, IInfrastructureRepository, IBuildingRepository {
  queries: LayerGeoJsonQuery[] = [];

  constructor(private summary: LayerSummary = { featureCount: 0, sourceIds: [] }) {}

  async findGeoJson(query: LayerGeoJsonQuery) {
    this.queries.push(query);
    return { type: "FeatureCollection", features: [], truncated: false } as RoadFeatureCollection &
      WaterwayFeatureCollection &
      SettlementFeatureCollection &
      InfrastructureFeatureCollection &
      BuildingFeatureCollection;
  }

  async summarise() {
    return this.summary;
  }
}

/**
 * Places saved by hand, kept in memory. `seed` adds a row as if it were already stored, which is how
 * a test gets an imported facility (origin "import") to refuse a change to.
 */
export class InMemoryFacilityRepository implements IFacilityRepository {
  rows = new Map<string, FacilityDto & { origin: FacilityOrigin }>();
  sources: ManualFacilitySource[] = [];
  created: NewFacility[] = [];
  private sequence = 0;

  seed(overrides: Partial<FacilityDto> = {}): FacilityDto {
    this.sequence += 1;
    const row: FacilityDto = {
      id: `50000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`,
      name: "Seeded clinic",
      facilityType: "health",
      osmClass: "clinic",
      note: null,
      origin: "manual",
      longitude: 7,
      latitude: 4.8,
      adminUnitId: null,
      createdAt: "2026-10-30T00:00:00.000Z",
      ...overrides,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }

  async ensureManualSource(input: ManualFacilitySource) {
    if (!this.sources.some((source) => source.datasetName === input.datasetName)) this.sources.push(input);
    return "60000000-0000-4000-8000-000000000001";
  }

  async create(input: NewFacility) {
    this.created.push(input);
    return this.seed({
      name: input.name,
      facilityType: input.facilityType,
      osmClass: input.osmClass,
      note: input.note,
      longitude: input.longitude,
      latitude: input.latitude,
      adminUnitId: input.adminUnitId,
    });
  }

  async update(id: string, changes: FacilityChanges) {
    const row = this.rows.get(id);
    if (!row || row.origin !== "manual") return null;
    Object.assign(row, changes);
    return row;
  }

  async delete(id: string) {
    const row = this.rows.get(id);
    if (!row || row.origin !== "manual") return false;
    return this.rows.delete(id);
  }
}

type StoredLayer = "roads" | "waterways" | "settlements" | "infrastructure" | "buildings";

export const EMPTY_BATCH: BatchResult = { received: 0, inserted: 0, alreadyPresent: 0, relinked: 0, unlinked: 0, rejected: {} };

/**
 * A loader transaction that records every call. By default each row is "inserted"; tests set
 * `known` to make the store behave as if those ids were stored by an earlier run.
 */
export class FakeLoadTx implements LayerLoadTx {
  sources: NewLayerSource[] = [];
  existingSourceIds = new Set<string>();
  known = new Set<string>();
  roads: { rows: RoadRow[]; context: BatchContext }[] = [];
  waterways: { rows: WaterwayRow[]; context: BatchContext }[] = [];
  settlements: { rows: SettlementRow[]; context: WardBatchContext }[] = [];
  infrastructure: { rows: InfrastructureRow[]; context: WardBatchContext }[] = [];
  buildings: { rows: BuildingRow[]; context: WardBatchContext }[] = [];

  async ensureSource(input: NewLayerSource): Promise<EnsuredSource> {
    const index = this.sources.findIndex((source) => JSON.stringify(source) === JSON.stringify(input));
    if (index >= 0) return { id: `source-${index + 1}`, created: false };
    this.sources.push(input);
    return { id: `source-${this.sources.length}`, created: true };
  }

  async sourceExists(id: string) {
    return this.existingSourceIds.has(id);
  }

  private result(keys: string[]): BatchResult {
    const fresh = keys.filter((key) => !this.known.has(key));
    return { ...EMPTY_BATCH, received: keys.length, inserted: fresh.length, alreadyPresent: keys.length - fresh.length };
  }

  async insertRoads(rows: RoadRow[], context: BatchContext) {
    this.roads.push({ rows, context });
    return this.result(rows.map((row) => row.osmId));
  }

  async insertWaterways(rows: WaterwayRow[], context: BatchContext) {
    this.waterways.push({ rows, context });
    return this.result(rows.map((row) => row.osmId));
  }

  async insertSettlements(rows: SettlementRow[], context: WardBatchContext) {
    this.settlements.push({ rows, context });
    return this.result(rows.map((row) => row.setId));
  }

  async insertInfrastructure(rows: InfrastructureRow[], context: WardBatchContext) {
    this.infrastructure.push({ rows, context });
    return this.result(rows.map((row) => row.osmId));
  }

  async insertBuildings(rows: BuildingRow[], context: WardBatchContext) {
    this.buildings.push({ rows, context });
    return this.result(rows.map((row) => row.osmId));
  }

  /** Rows each country "holds", for the clear tests; deleting empties the country's count. */
  stored: Record<StoredLayer, Record<string, number>> = { roads: {}, waterways: {}, settlements: {}, infrastructure: {}, buildings: {} };

  async deleteRoads(countryCode: string) {
    return this.take("roads", countryCode);
  }

  async deleteWaterways(countryCode: string) {
    return this.take("waterways", countryCode);
  }

  async deleteSettlements() {
    return this.take("settlements", "NGA");
  }

  async deleteInfrastructure(countryCode: string) {
    return this.take("infrastructure", countryCode);
  }

  async deleteBuildings(countryCode: string) {
    return this.take("buildings", countryCode);
  }

  private take(layer: StoredLayer, countryCode: string): number {
    const count = this.stored[layer][countryCode] ?? 0;
    this.stored[layer][countryCode] = 0;
    return count;
  }
}

/** Runs the work against one FakeLoadTx and records whether the "transaction" committed. */
export class FakeLoadStore implements ILayerLoadStore {
  readonly tx = new FakeLoadTx();
  committed = false;
  rolledBack = false;

  async inTransaction<T>(work: (tx: LayerLoadTx) => Promise<T>): Promise<T> {
    try {
      const result = await work(this.tx);
      this.committed = true;
      return result;
    } catch (err) {
      this.rolledBack = true;
      throw err;
    }
  }
}

/**
 * The field messages of the ValidationError a call throws. A ValidationError's own message is
 * always "Validation failed"; what went wrong is in its errors list.
 */
export function validationMessage(run: () => unknown): string {
  try {
    run();
  } catch (err) {
    if (err instanceof ValidationError) return (err.errors ?? []).map((e) => e.message).join(" | ");
    throw err;
  }
  throw new Error("expected a ValidationError, but nothing was thrown");
}

export async function validationMessageAsync(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (err) {
    if (err instanceof ValidationError) return (err.errors ?? []).map((e) => e.message).join(" | ");
    throw err;
  }
  throw new Error("expected a ValidationError, but nothing was thrown");
}

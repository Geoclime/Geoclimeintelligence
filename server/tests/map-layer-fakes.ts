import { ValidationError } from "../src/common/errors/app-error";
import type {
  BatchContext,
  BatchResult,
  EnsuredSource,
  ILayerLoadStore,
  LayerLoadTx,
  NewLayerSource,
  RoadRow,
  SettlementBatchContext,
  SettlementRow,
  WaterwayRow,
} from "../src/modules/map-layers/map-layer-loader.types";
import type {
  IRoadRepository,
  ISettlementRepository,
  IWaterwayRepository,
  LayerGeoJsonQuery,
  LayerSummary,
  RoadFeatureCollection,
  SettlementFeatureCollection,
  WaterwayFeatureCollection,
} from "../src/modules/map-layers/map-layer.types";

// In-memory stand-ins for the map-layer repositories, so services run with no database. Shapes
// and SQL are never computed here; the spatial SQL is verified against PostGIS, not faked.

/** Remembers the query it was given and returns an empty, untruncated layer. */
export class RecordingLayerRepository implements IRoadRepository, IWaterwayRepository, ISettlementRepository {
  queries: LayerGeoJsonQuery[] = [];

  constructor(private summary: LayerSummary = { featureCount: 0, sourceIds: [] }) {}

  async findGeoJson(query: LayerGeoJsonQuery) {
    this.queries.push(query);
    return { type: "FeatureCollection", features: [], truncated: false } as RoadFeatureCollection &
      WaterwayFeatureCollection &
      SettlementFeatureCollection;
  }

  async summarise() {
    return this.summary;
  }
}

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
  settlements: { rows: SettlementRow[]; context: SettlementBatchContext }[] = [];

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

  async insertSettlements(rows: SettlementRow[], context: SettlementBatchContext) {
    this.settlements.push({ rows, context });
    return this.result(rows.map((row) => row.setId));
  }

  /** Rows each country "holds", for the clear tests; deleting empties the country's count. */
  stored: Record<"roads" | "waterways" | "settlements", Record<string, number>> = { roads: {}, waterways: {}, settlements: {} };

  async deleteRoads(countryCode: string) {
    return this.take("roads", countryCode);
  }

  async deleteWaterways(countryCode: string) {
    return this.take("waterways", countryCode);
  }

  async deleteSettlements() {
    return this.take("settlements", "NGA");
  }

  private take(layer: "roads" | "waterways" | "settlements", countryCode: string): number {
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

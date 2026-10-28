import type { BBox } from "../../common/geo/geo";

/** A data source as the loader records it (the same fields as the admin "Add a source" form). */
export interface NewLayerSource {
  provider: string;
  datasetName: string;
  url: string;
  license: string;
  /** YYYY-MM-DD. */
  downloadedOn: string;
  notes: string | null;
}

/** One road ready to store. `shape` is the feature's geometry as GeoJSON text, still unchecked. */
export interface RoadRow {
  osmId: string;
  name: string | null;
  roadClass: string;
  classRank: number;
  surface: string | null;
  smoothness: string | null;
  width: string | null;
  lanes: string | null;
  oneway: string | null;
  isBridge: boolean;
  shape: string;
}

export interface WaterwayRow {
  osmId: string;
  name: string | null;
  waterwayType: string | null;
  waterTag: string | null;
  waterClass: string;
  classBasis: string;
  tunnel: string | null;
  covered: string | null;
  width: string | null;
  shape: string;
}

export interface SettlementRow {
  /** GRID3's settlement id (`set_id`). */
  setId: string;
  wardCode: string;
  name: string;
  isPrimary: boolean;
  dataOrigin: string | null;
  shape: string;
}

/** One facility (school, clinic, police station...) from a Geofabrik OpenStreetMap GeoPackage. */
export interface InfrastructureRow {
  /** OpenStreetMap's id as Geofabrik writes it (digits only, so `fromArea` is part of the key). */
  osmId: string;
  /** Mapped in OSM as an outline: the database stores a point inside it. */
  fromArea: boolean;
  name: string | null;
  facilityType: string;
  /** Geofabrik's `fclass` as delivered: hospital, school, ferry_terminal... */
  osmClass: string;
  shape: string;
}

/** Why a row was left out, with how many rows: shown to the person running the loader. */
export type RejectCounts = Record<string, number>;

export interface PreparedRows<T> {
  rows: T[];
  /** Rows dropped before the database saw them (no id, no shape, a duplicate id in the file...). */
  rejected: RejectCounts;
}

export interface BatchContext {
  countryCode: string;
  /** The country's rough box; null skips that check. */
  bbox: BBox | null;
  sourceId: string;
}

export interface WardBatchContext extends BatchContext {
  /** The admin level that holds wards (3 for Nigeria), where each row's ward is looked up. */
  wardLevel: number;
}

/** What one batch (or, summed, one layer) did. */
export interface BatchResult {
  received: number;
  inserted: number;
  /** Already stored from an earlier run, so left alone (never overwritten). */
  alreadyPresent: number;
  /** Settlements and infrastructure: stored earlier without a ward, and linked to one this time. */
  relinked: number;
  /** Settlements and infrastructure: stored now, but no live ward matched (by code, or by position). */
  unlinked: number;
  /** Rows the PostGIS checks refused: unreadable, wrong type, empty, outside the country's box... */
  rejected: RejectCounts;
}

export interface EnsuredSource {
  id: string;
  created: boolean;
}

/** The writes of one loader run, all inside one database transaction. */
export interface LayerLoadTx {
  /** Finds the source with exactly these details, or records it. */
  ensureSource(input: NewLayerSource): Promise<EnsuredSource>;
  sourceExists(id: string): Promise<boolean>;
  insertRoads(rows: RoadRow[], context: BatchContext): Promise<BatchResult>;
  insertWaterways(rows: WaterwayRow[], context: BatchContext): Promise<BatchResult>;
  insertSettlements(rows: SettlementRow[], context: WardBatchContext): Promise<BatchResult>;
  insertInfrastructure(rows: InfrastructureRow[], context: WardBatchContext): Promise<BatchResult>;
  /** Deletes every road of the country; returns how many went. */
  deleteRoads(countryCode: string): Promise<number>;
  /** Deletes every waterway (lines and areas) of the country; returns how many went. */
  deleteWaterways(countryCode: string): Promise<number>;
  /** Deletes every settlement point; returns how many went. */
  deleteSettlements(): Promise<number>;
  /** Deletes every facility of the country; returns how many went. */
  deleteInfrastructure(countryCode: string): Promise<number>;
}

/** What the loader service depends on, so it can be unit-tested with an in-memory fake (section 2). */
export interface ILayerLoadStore {
  /** Runs `work` in one transaction: everything it wrote is kept, or (if it throws) none of it. */
  inTransaction<T>(work: (tx: LayerLoadTx) => Promise<T>): Promise<T>;
}

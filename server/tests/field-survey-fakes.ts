import type {
  DrainageChanges,
  DrainageDto,
  DrainageRecord,
  DrainageSummary,
  FloodExtentDto,
  FloodExtentRecord,
  FloodHistory,
  FloodImpact,
  IDrainageRepository,
  IFloodExtentRepository,
  NewDrainage,
  NewFloodExtent,
} from "../src/modules/field-survey/field-survey.types";

// In-memory stand-ins for the field-survey repositories, so services run with no database. Shapes and
// areas are never computed here (the spatial SQL runs in PostGIS); `tooSmall` and `tooShort` make the
// store answer as if PostGIS had measured the shape outside what a flood or drain can be.

export const EMPTY_IMPACT: FloodImpact = {
  areaM2: 1_000,
  buildings: 0,
  roadMetres: 0,
  facilities: { total: 0, items: [] },
  settlements: [],
  wards: [],
  drains: { total: 0, needAttention: 0, items: [] },
};

type StoredExtent = FloodExtentDto & { recordedBy: string | null };

export class InMemoryFloodExtentRepository implements IFloodExtentRepository {
  rows = new Map<string, StoredExtent>();
  created: NewFloodExtent[] = [];
  tooSmall = false;
  impact: FloodImpact = EMPTY_IMPACT;
  private sequence = 0;

  /** Adds a row as if it were already stored. */
  seed(overrides: Partial<StoredExtent> = {}): StoredExtent {
    this.sequence += 1;
    const row: StoredExtent = {
      id: `70000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`,
      areaM2: 12_500,
      perimeterM: 450,
      depth: "knee",
      note: null,
      method: "walked",
      pointCount: 40,
      accuracyM: 8,
      wardId: null,
      lgaId: null,
      receded: false,
      recededAt: null,
      observedAt: "2026-10-31T09:00:00.000Z",
      longitude: 7.01,
      latitude: 4.78,
      recordedBy: "someone-else",
      ...overrides,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async findById(id: string): Promise<FloodExtentRecord | null> {
    const row = this.rows.get(id);
    return row ? { id, wardId: row.wardId, lgaId: row.lgaId, recordedBy: row.recordedBy, recededAt: row.recededAt ? new Date(row.recededAt) : null } : null;
  }

  async create(input: NewFloodExtent) {
    this.created.push(input);
    if (this.tooSmall) return null;
    return this.seed({
      wardId: input.wardId,
      lgaId: input.lgaId,
      method: input.method,
      depth: input.depth,
      note: input.note,
      pointCount: input.points.length,
      accuracyM: input.accuracyM,
      recordedBy: input.recordedBy,
    });
  }

  async findGeoJson() {
    return { type: "FeatureCollection" as const, features: [], truncated: false };
  }

  async impactOf(id: string) {
    return this.rows.has(id) ? this.impact : null;
  }

  /** What the public alert map asked for, to check it asks for the days and the cap it should. */
  activeCalls: { days: number; limit: number }[] = [];

  async findActive(days: number, limit: number) {
    this.activeCalls.push({ days, limit });
    return [...this.rows.values()]
      .filter((row) => !row.receded)
      .slice(0, limit)
      .map((row) => ({
        id: row.id,
        point: [Math.round(row.longitude * 1000) / 1000, Math.round(row.latitude * 1000) / 1000] as [number, number],
        areaM2: Math.round(row.areaM2),
        depth: row.depth,
        lgaName: null,
        observedAt: row.observedAt,
      }));
  }

  async findHistory(areaId: string, limit: number): Promise<FloodHistory> {
    const inArea = [...this.rows.values()].filter((row) => row.lgaId === areaId || row.wardId === areaId).sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    return {
      total: inArea.length,
      active: inArea.filter((row) => !row.receded).length,
      largestAreaM2: Math.max(0, ...inArea.map((row) => row.areaM2)),
      latestAt: inArea[0]?.observedAt ?? null,
      items: inArea.slice(0, limit).map((row) => ({
        id: row.id,
        areaM2: row.areaM2,
        depth: row.depth,
        method: row.method,
        observedAt: row.observedAt,
        receded: row.receded,
        recededAt: row.recededAt,
        wardName: null,
        longitude: row.longitude,
        latitude: row.latitude,
      })),
    };
  }

  async markReceded(id: string) {
    const row = this.rows.get(id);
    if (!row || row.receded) return null;
    Object.assign(row, { receded: true, recededAt: "2026-10-31T18:00:00.000Z" });
    return row;
  }

  async markActive(id: string) {
    const row = this.rows.get(id);
    if (!row || !row.receded) return null;
    Object.assign(row, { receded: false, recededAt: null });
    return row;
  }

  async delete(id: string) {
    return this.rows.delete(id);
  }
}

type StoredDrain = DrainageDto & { recordedBy: string | null };

export class InMemoryDrainageRepository implements IDrainageRepository {
  rows = new Map<string, StoredDrain>();
  created: NewDrainage[] = [];
  tooShort = false;
  private sequence = 0;

  seed(overrides: Partial<StoredDrain> = {}): StoredDrain {
    this.sequence += 1;
    const row: StoredDrain = {
      id: `80000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`,
      kind: "open_drain",
      condition: "partly_blocked",
      name: "Aba Road drain",
      widthM: 1.2,
      depthM: 0.8,
      lengthM: 120,
      note: "Silted up near the bridge",
      method: "walked",
      wardId: null,
      lgaId: null,
      lastCheckedAt: "2026-10-30T09:00:00.000Z",
      longitude: 7.01,
      latitude: 4.78,
      recordedBy: "someone-else",
      ...overrides,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async findById(id: string): Promise<DrainageRecord | null> {
    const row = this.rows.get(id);
    return row
      ? { id, kind: row.kind, condition: row.condition, name: row.name, widthM: row.widthM, depthM: row.depthM, note: row.note, wardId: row.wardId, lgaId: row.lgaId, recordedBy: row.recordedBy }
      : null;
  }

  async create(input: NewDrainage) {
    this.created.push(input);
    if (this.tooShort) return null;
    return this.seed({
      kind: input.kind,
      condition: input.condition,
      name: input.name,
      widthM: input.widthM,
      depthM: input.depthM,
      note: input.note,
      method: input.method,
      wardId: input.wardId,
      lgaId: input.lgaId,
      recordedBy: input.recordedBy,
      longitude: input.points[0]![0],
      latitude: input.points[0]![1],
    });
  }

  async update(id: string, changes: DrainageChanges) {
    const row = this.rows.get(id);
    if (!row) return null;
    Object.assign(row, changes, { lastCheckedAt: "2026-10-31T10:00:00.000Z" });
    return row;
  }

  async findGeoJson() {
    return { type: "FeatureCollection" as const, features: [], truncated: false };
  }

  async findSummary(areaId: string, limit: number): Promise<DrainageSummary> {
    const rank = (row: StoredDrain) => (["blocked", "overflowing", "damaged"].includes(row.condition) ? 0 : row.condition === "partly_blocked" ? 1 : 2);
    const inArea = [...this.rows.values()]
      .filter((row) => row.lgaId === areaId || row.wardId === areaId)
      .sort((a, b) => rank(a) - rank(b) || a.lastCheckedAt.localeCompare(b.lastCheckedAt));
    const latest = inArea.map((row) => row.lastCheckedAt).sort().at(-1) ?? null;
    return {
      total: inArea.length,
      needAttention: inArea.filter((row) => rank(row) === 0).length,
      partlyBlocked: inArea.filter((row) => row.condition === "partly_blocked").length,
      clear: inArea.filter((row) => row.condition === "clear").length,
      lastCheckedAt: latest,
      items: inArea.slice(0, limit).map((row) => ({
        id: row.id,
        kind: row.kind,
        condition: row.condition,
        name: row.name,
        widthM: row.widthM,
        depthM: row.depthM,
        lengthM: row.lengthM,
        lastCheckedAt: row.lastCheckedAt,
        wardName: null,
        longitude: row.longitude,
        latitude: row.latitude,
      })),
    };
  }

  async delete(id: string) {
    return this.rows.delete(id);
  }
}

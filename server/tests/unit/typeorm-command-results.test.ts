import { afterEach, describe, expect, it, vi } from "vitest";
import { AppDataSource } from "../../src/config/data-source";
import { BaseRepository } from "../../src/common/repository/base.repository";
import { DrainageRepository } from "../../src/modules/field-survey/drainage.repository";
import { FloodExtentRepository } from "../../src/modules/field-survey/flood-extent.repository";
import { FacilityRepository } from "../../src/modules/map-layers/facility.repository";
import { MapLayerLoadRepository } from "../../src/modules/map-layers/map-layer-load.repository";

// The in-memory fakes the other tests use never run SQL, so they can't catch how TypeORM hands a result
// back. It returns the rows of a SELECT or an INSERT ... RETURNING as they are, but for a bare UPDATE or
// DELETE it returns [rows, rowCount]. Code that reads `rows[0]` of that got the whole array and crashed
// (the "Water has gone down" button), and `rows.length > 0` was always true (a delete that "worked" on
// nothing). This stand-in answers the way TypeORM does, so a repository that runs a bare UPDATE or DELETE
// fails here instead of in front of a user.

/** What PostgresQueryRunner.query() returns for this statement, given the rows it produced. */
function typeormShape(sql: string, rows: unknown[]): unknown {
  return /^\s*(UPDATE|DELETE)\b/i.test(sql) ? [rows, rows.length] : rows;
}

function stubQuery(rowsFor: (sql: string) => unknown[]) {
  const calls: string[] = [];
  const query = async (sql: string) => {
    calls.push(sql);
    return typeormShape(sql, rowsFor(sql));
  };
  return { calls, query };
}

const isCount = (sql: string) => /count\(\*\)::int AS (n|deleted)/.test(sql);
const counting = (n: number) => (sql: string) => (isCount(sql) ? [{ n, deleted: n }] : []);

afterEach(() => vi.restoreAllMocks());

function useStub(stub: ReturnType<typeof stubQuery>) {
  vi.spyOn(BaseRepository.prototype as unknown as Record<string, unknown>, "repo", "get").mockReturnValue({ query: stub.query });
}

describe("repositories read UPDATE and DELETE results the way TypeORM returns them", () => {
  it("marks a flood receded and hands back the flood", async () => {
    const stub = stubQuery(() => [
      {
        id: "f1", areaM2: 12_500, perimeterM: 450, depth: "knee", note: null, method: "walked", pointCount: 40, accuracyM: 8,
        wardId: null, lgaId: null, recededAt: new Date("2026-10-31T18:00:00Z"), observedAt: new Date("2026-10-31T09:00:00Z"), longitude: 7, latitude: 4.8,
      },
    ]);
    useStub(stub);

    const flood = await new FloodExtentRepository().markReceded("f1");

    expect(flood).toMatchObject({ id: "f1", receded: true, recededAt: "2026-10-31T18:00:00.000Z", observedAt: "2026-10-31T09:00:00.000Z" });
    expect(stub.calls.every((sql) => !/^\s*(UPDATE|DELETE)\b/i.test(sql))).toBe(true);
  });

  it("says nothing was changed when no flood matched", async () => {
    useStub(stubQuery(() => []));
    expect(await new FloodExtentRepository().markReceded("missing")).toBeNull();
  });

  it("puts a receded flood back as still going and hands back the flood", async () => {
    const stub = stubQuery(() => [
      {
        id: "f1", areaM2: 12_500, perimeterM: 450, depth: "knee", note: null, method: "walked", pointCount: 40, accuracyM: 8,
        wardId: null, lgaId: null, recededAt: null, observedAt: new Date("2026-10-31T09:00:00Z"), longitude: 7, latitude: 4.8,
      },
    ]);
    useStub(stub);

    expect(await new FloodExtentRepository().markActive("f1")).toMatchObject({ id: "f1", receded: false, recededAt: null });
    expect(stub.calls.every((sql) => !/^\s*(UPDATE|DELETE)\b/i.test(sql))).toBe(true);
    expect(stub.calls[0]).toContain("receded_at IS NOT NULL");
  });

  it("re-inspects a drain and hands back the drain", async () => {
    useStub(
      stubQuery(() => [
        { id: "d1", kind: "open_drain", condition: "clear", name: null, widthM: null, depthM: null, lengthM: 120, note: null, method: "walked", wardId: null, lgaId: null, lastCheckedAt: new Date("2026-10-31T10:00:00Z"), longitude: 7, latitude: 4.8 },
      ]),
    );
    expect(await new DrainageRepository().update("d1", { condition: "clear", name: null, widthM: null, depthM: null, note: null })).toMatchObject({
      id: "d1",
      condition: "clear",
      lastCheckedAt: "2026-10-31T10:00:00.000Z",
    });
  });

  it("changes a saved place and hands back the place", async () => {
    useStub(stubQuery(() => [{ id: "p1", name: "St. Mary's", facilityType: "health", osmClass: "hospital", note: null, origin: "manual", longitude: 7, latitude: 4.8, adminUnitId: null, createdAt: new Date("2026-10-31T10:00:00Z") }]));
    expect(await new FacilityRepository().update("p1", { name: "St. Mary's", facilityType: "health", osmClass: "hospital", note: null })).toMatchObject({
      id: "p1",
      createdAt: "2026-10-31T10:00:00.000Z",
    });
  });

  it.each([
    ["a flood", () => new FloodExtentRepository()],
    ["a drain", () => new DrainageRepository()],
    ["a saved place", () => new FacilityRepository()],
  ])("deletes %s only when a row was really removed", async (_name, build) => {
    const repository = build();
    useStub(stubQuery(counting(1)));
    expect(await repository.delete("x")).toBe(true);

    useStub(stubQuery(counting(0)));
    expect(await repository.delete("x")).toBe(false);
  });
});

describe("clearing a map layer counts what it removed", () => {
  it("reports the real count for roads, waterways, settlements, infrastructure and buildings, not the length of TypeORM's [rows, count]", async () => {
    const stub = stubQuery(counting(7));
    vi.spyOn(AppDataSource, "transaction").mockImplementation((async (work: (manager: unknown) => unknown) => work({ query: stub.query })) as never);

    const counts = await MapLayerLoadRepository.Instance.inTransaction(async (tx) => [
      await tx.deleteRoads("NGA"),
      await tx.deleteWaterways("NGA"),
      await tx.deleteSettlements(),
      await tx.deleteInfrastructure("NGA"),
      await tx.deleteBuildings("NGA"),
    ]);

    expect(counts).toEqual([7, 7, 7, 7, 7]);
    expect(stub.calls.every((sql) => !/^\s*DELETE\b/i.test(sql))).toBe(true);
    // Clearing imported facilities must leave the places an administrator saved by hand.
    expect(stub.calls.find((sql) => sql.includes("FROM infrastructure"))).toContain("origin = 'import'");
  });
});

import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../src/common/errors/app-error";
import { RainfallService } from "../../src/modules/rainfall/rainfall.service";
import type { RainfallMonthRow } from "../../src/modules/rainfall/rainfall.types";
import { InMemoryAdminUnitRepository, InMemoryDataSourceRepository, InMemoryRainfallRepository, makeSource, makeUnit } from "../geo-fakes";

const chirps = makeSource({ id: "20000000-0000-4000-8000-000000000009", provider: "Climate Hazards Center", datasetName: "CHIRPS v2.0" });
const emohua = makeUnit({ unitName: "Emohua", unitCode: "NG033010" });
const etche = makeUnit({ unitName: "Etche", unitCode: "NG033011" });

const month = (yearMonth: string, rainfallMm: number | null): RainfallMonthRow => ({
  yearMonth,
  rainfallMm,
  dataType: "OBSERVED",
  sourceId: chirps.id,
});

function setup() {
  const series = new Map([[emohua.id, [month("2026-07", 420.1), month("2026-08", 304.5), month("2026-09", null)]]]);
  return new RainfallService(
    new InMemoryRainfallRepository([], series),
    new InMemoryAdminUnitRepository([emohua, etche]),
    new InMemoryDataSourceRepository([chirps]),
  );
}

describe("RainfallService.series", () => {
  it("returns the area's months oldest first, with each source once and the data types", async () => {
    const result = await setup().series({ adminUnitId: emohua.id });
    expect(result.adminUnit).toMatchObject({ id: emohua.id, unitName: "Emohua", unitCode: "NG033010" });
    expect(result.months).toEqual([
      { yearMonth: "2026-07", rainfallMm: 420.1 },
      { yearMonth: "2026-08", rainfallMm: 304.5 },
      { yearMonth: "2026-09", rainfallMm: null },
    ]);
    expect(result.dataTypes).toEqual(["OBSERVED"]);
    expect(result.sources.map((s) => s.datasetName)).toEqual(["CHIRPS v2.0"]);
  });

  it("narrows to a range", async () => {
    const result = await setup().series({ adminUnitId: emohua.id, from: "2026-08", to: "2026-08" });
    expect(result.months.map((m) => m.yearMonth)).toEqual(["2026-08"]);
  });

  it("gives an area with no rainfall an empty series, and 404s an unknown area", async () => {
    await expect(setup().series({ adminUnitId: etche.id })).resolves.toMatchObject({ months: [], dataTypes: [], sources: [] });
    await expect(setup().series({ adminUnitId: "99999999-9999-4999-8999-999999999999" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

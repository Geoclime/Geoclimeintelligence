import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "../../src/common/errors/app-error";
import { AdminUnitService } from "../../src/modules/admin-units/admin-unit.service";
import { CountryService } from "../../src/modules/admin-units/country.service";
import {
  InMemoryAdminUnitRepository,
  InMemoryCountryRepository,
  InMemoryDataSourceRepository,
  makeCountry,
  makeSource,
  makeUnit,
} from "../geo-fakes";

describe("CountryService", () => {
  it("creates a country with no areas yet", async () => {
    const service = new CountryService(new InMemoryCountryRepository());
    const country = await service.create({ countryCode: "NGA", countryName: "Nigeria", levelNames: ["State", "LGA", "Ward"], bbox: null });
    expect(country.levels).toEqual([
      { level: 1, name: "State", unitCount: 0 },
      { level: 2, name: "LGA", unitCount: 0 },
      { level: 3, name: "Ward", unitCount: 0 },
    ]);
  });

  it("refuses a second country with the same code (409)", async () => {
    const service = new CountryService(new InMemoryCountryRepository([makeCountry()]));
    await expect(
      service.create({ countryCode: "NGA", countryName: "Nigeria", levelNames: ["State"], bbox: null }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("reports how many areas each level holds", async () => {
    const repo = new InMemoryCountryRepository([makeCountry()]);
    repo.counts = [
      { countryCode: "NGA", level: 1, count: 1 },
      { countryCode: "NGA", level: 2, count: 23 },
    ];
    const country = await new CountryService(repo).get("NGA");
    expect(country.levels.map((l) => l.unitCount)).toEqual([1, 23, 0]);
  });

  it("renames levels freely but never drops a level that holds areas", async () => {
    const repo = new InMemoryCountryRepository([makeCountry()]);
    repo.counts = [{ countryCode: "NGA", level: 3, count: 317 }];
    const service = new CountryService(repo);

    await expect(service.update("NGA", { levelNames: ["State", "Local Government Area", "Ward"] })).resolves.toMatchObject({
      levels: [{ name: "State" }, { name: "Local Government Area" }, { name: "Ward", unitCount: 317 }],
    });
    await expect(service.update("NGA", { levelNames: ["State", "LGA"] })).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns 404 for an unknown country", async () => {
    await expect(new CountryService(new InMemoryCountryRepository()).get("GHA")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("AdminUnitService", () => {
  const rivers = makeUnit({ level: 1, levelName: "State", unitName: "Rivers" });
  const ph = makeUnit({ unitName: "Port Harcourt", parentId: rivers.id });
  const ward = makeUnit({ level: 3, levelName: "Ward", unitName: "Phward 17", parentId: ph.id });

  function setup() {
    const units = new InMemoryAdminUnitRepository([rivers, ph, ward]);
    return { units, service: new AdminUnitService(units, new InMemoryDataSourceRepository([makeSource()])) };
  }

  it("returns one area with its parent, source, child count and shape", async () => {
    const detail = await setup().service.getById(ph.id);
    expect(detail).toMatchObject({
      unitName: "Port Harcourt",
      childCount: 1,
      parent: { id: rivers.id, unitName: "Rivers" },
      source: { provider: "geoBoundaries", license: "CC BY 4.0" },
      geometry: { type: "MultiPolygon" },
    });
  });

  it("returns 404 for an unknown area and for the children of one", async () => {
    const { service } = setup();
    await expect(service.getById("99999999-9999-4999-8999-999999999999")).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.children("99999999-9999-4999-8999-999999999999", { page: 1, pageSize: 25 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("locates a point as state > LGA > ward", async () => {
    const { units, service } = setup();
    units.containing = [rivers, ph, ward];
    const result = await service.locate({ lon: 7.0134, lat: 4.7774 });
    expect(result.point).toEqual([7.0134, 4.7774]);
    expect(result.units.map((u) => u.levelName)).toEqual(["State", "LGA", "Ward"]);
    expect(result.units[0]).not.toHaveProperty("parentId");
  });

  it("returns 404 for a point outside every mapped area", async () => {
    await expect(setup().service.locate({ lon: -0.1276, lat: 51.5072 })).rejects.toMatchObject({
      statusCode: 404,
      message: "No mapped area contains this point",
    });
  });
});

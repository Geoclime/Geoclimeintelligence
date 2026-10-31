import { describe, expect, it } from "vitest";
import type { AuthUser } from "../../src/common/access/auth-user";
import { ForbiddenError, NotFoundError } from "../../src/common/errors/app-error";
import { FacilityService } from "../../src/modules/map-layers/facility.service";
import { createFacilitySchema, updateFacilitySchema } from "../../src/modules/map-layers/facility.validation";
import { InMemoryAdminUnitRepository, makeUnit } from "../geo-fakes";
import { InMemoryFacilityRepository, validationMessageAsync } from "../map-layer-fakes";

const state = makeUnit({ level: 1, levelName: "State", unitName: "Rivers" });
const lga = makeUnit({ level: 2, levelName: "LGA", unitName: "Port Harcourt", parentId: state.id });
const ward = makeUnit({ level: 3, levelName: "Ward", unitName: "Phward 2", parentId: lga.id });

const admin: AuthUser = {
  id: "00000000-0000-4000-8000-0000000000aa",
  firebaseUid: "admin-uid",
  email: null,
  displayName: null,
  role: "administrator",
  scopeAdminUnitId: null,
  profileComplete: true,
};

function build(containing = [state, lga, ward]) {
  const facilities = new InMemoryFacilityRepository();
  const units = new InMemoryAdminUnitRepository([state, lga, ward]);
  units.containing = containing;
  return { service: new FacilityService(facilities, units, "https://geoclime.example.com"), facilities };
}

const hospital = { name: "St. Mary's Hospital", kind: "hospital", longitude: 7.0123, latitude: 4.8156 };

describe("FacilityService.create", () => {
  it("saves a place in the country and ward the spot is in, as the right facility type", async () => {
    const { service, facilities } = build();
    const saved = await service.create({ ...hospital, note: "Has a 24-hour emergency ward" }, admin);

    expect(facilities.created).toEqual([
      {
        countryCode: "NGA",
        adminUnitId: ward.id,
        name: "St. Mary's Hospital",
        facilityType: "health",
        osmClass: "hospital",
        note: "Has a 24-hour emergency ward",
        longitude: 7.0123,
        latitude: 4.8156,
        sourceId: "60000000-0000-4000-8000-000000000001",
        createdBy: admin.id,
      },
    ]);
    expect(saved).toMatchObject({ name: "St. Mary's Hospital", facilityType: "health", origin: "manual" });
  });

  it("files every kind under the type the import would give it", async () => {
    const { service, facilities } = build();
    for (const kind of ["clinic", "school", "police", "ferry_terminal", "christian", "muslim", "water_well"]) {
      await service.create({ ...hospital, kind }, admin);
    }
    expect(facilities.created.map((place) => place.facilityType)).toEqual(["health", "education", "emergency", "transport", "worship", "worship", "water"]);
  });

  it("stores no ward when the spot is in no loaded ward, and treats a blank note as none", async () => {
    const { service, facilities } = build([state, lga]);
    await service.create({ ...hospital, note: "" }, admin);
    expect(facilities.created[0]).toMatchObject({ adminUnitId: null, note: null });
  });

  it("points every saved place at one standing data source, made once", async () => {
    const { service, facilities } = build();
    await service.create(hospital, admin);
    await service.create({ ...hospital, name: "Another clinic", kind: "clinic" }, admin);
    expect(facilities.sources).toEqual([
      expect.objectContaining({
        provider: "GeoClime Intelligence administrators",
        url: "https://geoclime.example.com",
        createdBy: admin.id,
      }),
    ]);
  });

  it("refuses a spot outside every mapped area, and saves nothing", async () => {
    const { service, facilities } = build([]);
    expect(await validationMessageAsync(() => service.create(hospital, admin))).toMatch(/outside every mapped area/);
    expect(facilities.created).toEqual([]);
    expect(facilities.sources).toEqual([]);
  });
});

describe("FacilityService.update and remove", () => {
  it("changes only what was sent and keeps the rest", async () => {
    const { service, facilities } = build();
    const place = facilities.seed({ name: "Old name", osmClass: "clinic", note: "keep me" });

    const renamed = await service.update(place.id, { name: "New name" });
    expect(renamed).toMatchObject({ name: "New name", osmClass: "clinic", facilityType: "health", note: "keep me" });
  });

  it("moves a place to another type when its kind changes, and clears a note with a blank one", async () => {
    const { service, facilities } = build();
    const place = facilities.seed({ osmClass: "clinic", note: "old" });

    const changed = await service.update(place.id, { kind: "school", note: "" });
    expect(changed).toMatchObject({ osmClass: "school", facilityType: "education", note: null });
  });

  it("will not change or delete an imported facility", async () => {
    const { service, facilities } = build();
    const imported = facilities.seed({ origin: "import" });

    await expect(service.update(imported.id, { name: "Renamed" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.remove(imported.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(facilities.rows.get(imported.id)).toMatchObject({ name: "Seeded clinic" });
  });

  it("deletes a place saved by hand, and says 404 for one that is not there", async () => {
    const { service, facilities } = build();
    const place = facilities.seed();

    await service.remove(place.id);
    expect(facilities.rows.has(place.id)).toBe(false);
    await expect(service.remove(place.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.update("50000000-0000-4000-8000-0000000000ff", { name: "Nobody" })).rejects.toBeInstanceOf(NotFoundError);
  });

});

describe("facility validation", () => {
  const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) => result.error?.issues.map((issue) => issue.message) ?? [];

  it("accepts a name, a known kind and a point, and tidies them", () => {
    const parsed = createFacilitySchema.parse({ body: { name: "  St. Mary's  ", kind: " Hospital ", longitude: 7.01, latitude: 4.81 } });
    expect(parsed.body).toEqual({ name: "St. Mary's", kind: "hospital", longitude: 7.01, latitude: 4.81 });
  });

  it("refuses a missing name, an unknown kind and a point off the globe", () => {
    const bad = createFacilitySchema.safeParse({ body: { name: " ", kind: "spaceport", longitude: 190, latitude: -95 } });
    expect(messages(bad)).toEqual(
      expect.arrayContaining([
        "Give the place a name",
        "Choose what kind of place this is",
        "Longitude must be between -180 and 180",
        "Latitude must be between -90 and 90",
      ]),
    );
  });

  it("does not read a missing coordinate as zero, and refuses fields it does not know", () => {
    expect(createFacilitySchema.safeParse({ body: { ...hospital, longitude: null } }).success).toBe(false);
    expect(createFacilitySchema.safeParse({ body: { ...hospital, origin: "import" } }).success).toBe(false);
  });

  it("limits the note, and needs something to change on an edit", () => {
    expect(createFacilitySchema.safeParse({ body: { ...hospital, note: "x".repeat(501) } }).success).toBe(false);
    const id = "50000000-0000-4000-8000-000000000001";
    expect(updateFacilitySchema.safeParse({ params: { id }, body: {} }).success).toBe(false);
    expect(updateFacilitySchema.safeParse({ params: { id }, body: { note: "" } }).success).toBe(true);
    expect(updateFacilitySchema.safeParse({ params: { id: "nope" }, body: { name: "Clinic" } }).success).toBe(false);
  });
});

import type { AuthUser } from "../../common/access/auth-user";
import { ForbiddenError, NotFoundError, ValidationError } from "../../common/errors/app-error";
import { env } from "../../config/env";
import { AdminUnitRepository } from "../admin-units/admin-unit.repository";
import type { IAdminUnitRepository } from "../admin-units/admin-unit.types";
import type { CreateFacilityBody, UpdateFacilityBody } from "./facility.validation";
import { FacilityRepository } from "./facility.repository";
import { DEFAULT_WARD_LEVEL, facilityTypeOf, type FacilityType } from "./layer-rules";
import type { FacilityDto, IFacilityRepository } from "./map-layer.types";

/** The one data source every place saved by hand points at, so provenance still reaches each row. */
const MANUAL_SOURCE = {
  provider: "GeoClime Intelligence administrators",
  datasetName: "Places saved by hand on the map",
  license: "Entered by GeoClime administrators; not from an open dataset",
  notes: "Facilities an administrator saved from the map, for example after visiting a place the OpenStreetMap extract missed.",
} as const;

const NOT_HAND_SAVED = "Only a place saved by hand can be changed here. Imported facilities come from their data source.";

/** The facility type of a kind the validator has already accepted. */
function typeOfKind(kind: string): FacilityType {
  const type = facilityTypeOf(kind);
  // The route's schema refuses any other kind; this guards a caller that skipped it.
  if (!type) throw new ValidationError([{ field: "kind", message: "Choose what kind of place this is" }]);
  return type;
}

/**
 * Lets an administrator save a place from the map that the OpenStreetMap extract didn't capture (a
 * hospital they visited), and correct or remove it later. It goes in the same table as the imported
 * facilities, so the map draws it and ward counts include it, but it is marked 'manual': reloading or
 * clearing the import never touches it, and an imported facility can't be changed through here.
 * Administrator-only (authorise on the route); like the rest of the map, places are shared reference
 * data, not region-owned records, so no region check applies.
 */
export class FacilityService {
  private static _instance?: FacilityService;
  static get Instance(): FacilityService {
    return (this._instance ??= new FacilityService(FacilityRepository.Instance, AdminUnitRepository.Instance, env.APP_URL));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly facilities: IFacilityRepository,
    private readonly units: Pick<IAdminUnitRepository, "findContaining">,
    /** Where the web app lives: the standing data source needs a link, and this is the platform itself. */
    private readonly appUrl: string,
  ) {}

  async create(input: CreateFacilityBody, actor: AuthUser): Promise<FacilityDto> {
    const containing = await this.units.findContaining(input.longitude, input.latitude);
    const country = containing[0];
    // Every facility belongs to a country, and a spot outside every loaded boundary has none.
    if (!country) {
      throw new ValidationError([{ field: "longitude", message: "That spot is outside every mapped area, so it can't be saved. Choose a place inside the boundaries." }]);
    }

    const sourceId = await this.facilities.ensureManualSource({ ...MANUAL_SOURCE, url: this.appUrl, createdBy: actor.id });
    return this.facilities.create({
      countryCode: country.countryCode,
      // The ward, when the spot is inside a loaded one. Unlike an import it is not relinked later.
      adminUnitId: containing.find((unit) => unit.level === DEFAULT_WARD_LEVEL)?.id ?? null,
      name: input.name,
      facilityType: typeOfKind(input.kind),
      osmClass: input.kind,
      note: input.note || null,
      longitude: input.longitude,
      latitude: input.latitude,
      sourceId,
      createdBy: actor.id,
    });
  }

  /** Changes the name, kind or note. The point stays where it was saved. */
  async update(id: string, input: UpdateFacilityBody): Promise<FacilityDto> {
    const existing = await this.requireHandSaved(id);
    const kind = input.kind ?? existing.osmClass;
    const updated = await this.facilities.update(id, {
      name: input.name ?? existing.name ?? "",
      facilityType: input.kind ? typeOfKind(input.kind) : existing.facilityType,
      osmClass: kind,
      note: input.note === undefined ? existing.note : input.note || null,
    });
    // Deleted by someone else between the read and the write.
    if (!updated) throw new NotFoundError("Place");
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.requireHandSaved(id);
    if (!(await this.facilities.delete(id))) throw new NotFoundError("Place");
  }

  private async requireHandSaved(id: string) {
    const existing = await this.facilities.findById(id);
    if (!existing) throw new NotFoundError("Place");
    if (existing.origin !== "manual") throw new ForbiddenError(NOT_HAND_SAVED);
    return existing;
  }
}

import type { AuthUser } from "../../common/access/auth-user";
import { PermissionResolver } from "../../common/access/permission-resolver";
import { ForbiddenError, NotFoundError, ValidationError } from "../../common/errors/app-error";
import { AdminUnitRepository } from "../admin-units/admin-unit.repository";
import type { IAdminUnitRepository } from "../admin-units/admin-unit.types";
import { AuditService } from "../audit/audit.service";
import { DEFAULT_WARD_LEVEL } from "../map-layers/layer-rules";
import { HouseholdPhotoService } from "./household-photo.service";
import { HouseholdRepository } from "./household.repository";
import type { HouseholdDto, HouseholdFeatureCollection, IHouseholdRepository } from "./household.types";
import type { CreateHouseholdBody, UpdateHouseholdBody } from "./household.validation";

/**
 * Households: anyone signed in can mark their home (or homes) on the map, as many as they need.
 *
 * A household is private. Its owner sees it, and so do staff whose role holds households.view
 * (responders and officials as seeded, and administrators), for planning and rescue; nobody else does,
 * and it never goes on the public alert map. Only the owner can change or delete it (administrators
 * too, to remove abuse). Its owner is told when an alert covers its LGA or a flood is recorded near it
 * (notification-events.ts), and a recorded flood counts the households it reaches.
 *
 * The activity log records that a household was added, changed or removed, but never where it is.
 */
export class HouseholdService {
  private static _instance?: HouseholdService;
  static get Instance(): HouseholdService {
    return (this._instance ??= new HouseholdService(HouseholdRepository.Instance, AdminUnitRepository.Instance, PermissionResolver.Instance, AuditService.Instance, HouseholdPhotoService.Instance));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly households: IHouseholdRepository,
    private readonly units: Pick<IAdminUnitRepository, "findContaining">,
    private readonly permissions: Pick<PermissionResolver, "has">,
    private readonly audit: Pick<AuditService, "record">,
    private readonly photos: Pick<HouseholdPhotoService, "removeAllFor">,
  ) {}

  async create(input: CreateHouseholdBody, actor: AuthUser): Promise<HouseholdDto> {
    const containing = await this.units.findContaining(input.longitude, input.latitude);
    const country = containing[0];
    if (!country) {
      throw new ValidationError([{ field: "longitude", message: "That spot is outside every mapped area. Choose your home inside the boundaries." }]);
    }
    const ward = containing.find((unit) => unit.level === DEFAULT_WARD_LEVEL) ?? null;
    const lga = containing.find((unit) => unit.level === 2) ?? null;
    const household = await this.households.create(
      {
        ownerId: actor.id,
        countryCode: country.countryCode,
        lgaId: lga?.id ?? null,
        wardId: ward?.id ?? null,
        label: input.label,
        note: input.note || null,
        people: input.people ?? null,
        homeType: input.homeType ?? null,
        phone: input.phone || null,
        longitude: input.longitude,
        latitude: input.latitude,
      },
      actor.id,
    );
    await this.audit.record(actor, {
      action: "household.saved",
      entityType: "household",
      entityId: household.id,
      lgaId: household.lgaId,
      wardId: household.wardId,
      summary: "Added a household to the map",
    });
    return household;
  }

  async update(id: string, input: UpdateHouseholdBody, actor: AuthUser): Promise<HouseholdDto> {
    const existing = await this.ownOrAdmin(id, actor);
    const updated = await this.households.update(
      id,
      {
        label: input.label ?? existing.label,
        note: input.note === undefined ? existing.note : input.note || null,
        people: input.people === undefined ? existing.people : input.people,
        homeType: input.homeType === undefined ? existing.homeType : input.homeType,
        phone: input.phone === undefined ? existing.phone : input.phone || null,
      },
      actor.id,
    );
    if (!updated) throw new NotFoundError("Household");
    return updated;
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const existing = await this.ownOrAdmin(id, actor);
    // Its photos' files go first: the rows go with the household.
    await this.photos.removeAllFor(id);
    if (!(await this.households.delete(id))) throw new NotFoundError("Household");
    await this.audit.record(actor, {
      action: "household.deleted",
      entityType: "household",
      entityId: id,
      lgaId: existing.lgaId,
      wardId: existing.wardId,
      summary: existing.ownerId === actor.id ? "Removed their household from the map" : "Removed someone's household from the map",
    });
  }

  mine(actor: AuthUser): Promise<HouseholdDto[]> {
    return this.households.findMine(actor.id);
  }

  /** The households in view: everyone's for staff with households.view, otherwise only the viewer's own. */
  async geoJson(bbox: [number, number, number, number], actor: AuthUser): Promise<HouseholdFeatureCollection> {
    return this.households.findGeoJson(bbox, actor.id, await this.permissions.has(actor, "households.view"));
  }

  /** Someone else's household is not even confirmed to exist: a 404, not a 403. Administrators may remove any. */
  private async ownOrAdmin(id: string, actor: AuthUser) {
    const existing = await this.households.findById(id);
    if (!existing) throw new NotFoundError("Household");
    if (existing.ownerId === actor.id) return existing;
    if (actor.role === "administrator") return existing;
    if (await this.permissions.has(actor, "households.view")) throw new ForbiddenError("Only the person who added a household can change it");
    throw new NotFoundError("Household");
  }
}

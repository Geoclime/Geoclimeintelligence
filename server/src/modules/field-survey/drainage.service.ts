import type { AuthUser } from "../../common/access/auth-user";
import { RegionAccess } from "../../common/access/region-access";
import { NotFoundError, ValidationError } from "../../common/errors/app-error";
import { domainEvents } from "../../common/events/domain-events";
import { AdminUnitRepository } from "../admin-units/admin-unit.repository";
import type { IAdminUnitRepository } from "../admin-units/admin-unit.types";
import type { LayerGeoJsonQuery } from "../map-layers/map-layer.types";
import { DrainageRepository } from "./drainage.repository";
import type { DrainageDto, DrainageFeatureCollection, DrainageSummary, IDrainageRepository } from "./field-survey.types";
import type { CreateDrainageBody, UpdateDrainageBody } from "./field-survey.validation";
import { assertMayDelete, assertRecordInRegion, locateSurvey } from "./survey-location";
import { SURVEY_LIMITS } from "./survey-rules";

const { min, max } = SURVEY_LIMITS.drainLengthM;

/**
 * Drainage: the drains, culverts, outfalls, inlets and ponds that carry water away, and what shape
 * they are in. Recording, and re-inspecting (changing the condition), are open to responders,
 * officials and administrators inside their region, because the point of the layer is that anyone
 * passing a blocked drain can say so, and the next person can say it is clear. Deleting is for whoever
 * recorded it, or an administrator. Everyone signed in sees the layer.
 */
export class DrainageService {
  private static _instance?: DrainageService;
  static get Instance(): DrainageService {
    return (this._instance ??= new DrainageService(DrainageRepository.Instance, AdminUnitRepository.Instance, RegionAccess.Instance));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly drains: IDrainageRepository,
    private readonly units: Pick<IAdminUnitRepository, "findContaining" | "findSummaryById">,
    private readonly regions: Pick<RegionAccess, "assert">,
  ) {}

  async create(input: CreateDrainageBody, actor: AuthUser): Promise<DrainageDto> {
    const place = await locateSurvey(this.units, input.points);
    await this.regions.assert(actor, place.regionId);

    const drain = await this.drains.create({
      countryCode: place.countryCode,
      wardId: place.wardId,
      lgaId: place.lgaId,
      kind: input.kind,
      condition: input.condition,
      name: input.name || null,
      widthM: input.widthM ?? null,
      depthM: input.depthM ?? null,
      note: input.note || null,
      method: input.method,
      points: input.points,
      recordedBy: actor.id,
    });
    // A walked drain the database measured as shorter or longer than a drain can be.
    if (!drain) {
      throw new ValidationError([{ field: "points", message: `The drain is shorter than ${min} m or longer than ${max / 1000} km. Check the points and try again.` }]);
    }
    domainEvents.emit("drain.recorded", { drainId: drain.id });
    return drain;
  }

  list(query: LayerGeoJsonQuery): Promise<DrainageFeatureCollection> {
    return this.drains.findGeoJson(query);
  }

  /** The drainage recorded in an LGA or ward, for that place's page: for anyone signed in, like the map. */
  async summary(areaId: string, limit: number): Promise<DrainageSummary> {
    if (!(await this.units.findSummaryById(areaId))) throw new NotFoundError("Area");
    return this.drains.findSummary(areaId, limit);
  }

  /** An inspection: changes what was sent, keeps the rest, and moves "last checked" to now. */
  async update(id: string, input: UpdateDrainageBody, actor: AuthUser): Promise<DrainageDto> {
    const record = await this.drains.findById(id);
    if (!record) throw new NotFoundError("Drainage");
    await assertRecordInRegion(this.regions, actor, record);

    const updated = await this.drains.update(id, {
      condition: input.condition ?? record.condition,
      name: input.name === undefined ? record.name : input.name || null,
      widthM: input.widthM === undefined ? record.widthM : input.widthM,
      depthM: input.depthM === undefined ? record.depthM : input.depthM,
      note: input.note === undefined ? record.note : input.note || null,
    });
    if (!updated) throw new NotFoundError("Drainage");
    domainEvents.emit("drain.inspected", { drainId: id });
    return updated;
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const record = await this.drains.findById(id);
    if (!record) throw new NotFoundError("Drainage");
    assertMayDelete(actor, record.recordedBy);
    if (!(await this.drains.delete(id))) throw new NotFoundError("Drainage");
    domainEvents.emit("drain.deleted", { drainId: id });
  }
}

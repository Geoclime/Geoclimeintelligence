import type { AuthUser } from "../../common/access/auth-user";
import { RegionAccess } from "../../common/access/region-access";
import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/app-error";
import { domainEvents } from "../../common/events/domain-events";
import { AdminUnitRepository } from "../admin-units/admin-unit.repository";
import type { IAdminUnitRepository } from "../admin-units/admin-unit.types";
import type { LayerGeoJsonQuery } from "../map-layers/map-layer.types";
import { FloodExtentRepository } from "./flood-extent.repository";
import type { FloodExtentDto, FloodExtentFeatureCollection, FloodExtentWithImpact, FloodHistory, FloodImpact, IFloodExtentRepository, PublicFloodPoint } from "./field-survey.types";
import type { CreateFloodExtentBody } from "./field-survey.validation";
import { assertMayDelete, assertRecordInRegion, locateSurvey } from "./survey-location";
import { SURVEY_LIMITS } from "./survey-rules";

const { min, max } = SURVEY_LIMITS.extentAreaM2;

/**
 * Flood extents: the reach of a flood, recorded on the ground. Responders, officials and administrators
 * walk (or draw) its edge; everyone signed in sees it on the map, with what it reaches. The route's
 * authorise() is the role check; region scope is checked here, because it needs the area hierarchy.
 * Recording and receding are open to anyone in scope (a flood is everyone's to report and to call
 * over); deleting is for whoever recorded it, or an administrator. Each change is announced
 * (flood.recorded, flood.receded, flood.deleted) so the public alert map, which shows the floods that
 * are still going, is refreshed for everyone watching it.
 */
export class FloodExtentService {
  private static _instance?: FloodExtentService;
  static get Instance(): FloodExtentService {
    return (this._instance ??= new FloodExtentService(FloodExtentRepository.Instance, AdminUnitRepository.Instance, RegionAccess.Instance));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly extents: IFloodExtentRepository,
    private readonly units: Pick<IAdminUnitRepository, "findContaining" | "findSummaryById">,
    private readonly regions: Pick<RegionAccess, "assert">,
  ) {}

  async create(input: CreateFloodExtentBody, actor: AuthUser): Promise<FloodExtentWithImpact> {
    const place = await locateSurvey(this.units, input.points);
    await this.regions.assert(actor, place.regionId);

    const extent = await this.extents.create({
      countryCode: place.countryCode,
      wardId: place.wardId,
      lgaId: place.lgaId,
      points: input.points,
      method: input.method,
      depth: input.depth ?? null,
      note: input.note || null,
      accuracyM: input.accuracyM ?? null,
      recordedBy: actor.id,
    });
    // The database measured the shape and it was outside what a flood can be: a GPS jump, or a tap in the wrong place.
    if (!extent) {
      throw new ValidationError([
        { field: "points", message: `The shape covers less than ${min} m² or more than ${max / 1_000_000} km², which a flood can't. Check the points and try again.` },
      ]);
    }
    domainEvents.emit("flood.recorded", { floodId: extent.id });
    return { extent, impact: (await this.extents.impactOf(extent.id)) ?? emptyImpact(extent.areaM2) };
  }

  /**
   * Every flood recorded in an LGA or ward, receded ones too: the history on a place's page. Like the map
   * it is for anyone signed in, so it carries no outline, note or recorder.
   */
  async history(areaId: string, limit: number): Promise<FloodHistory> {
    if (!(await this.units.findSummaryById(areaId))) throw new NotFoundError("Area");
    return this.extents.findHistory(areaId, limit);
  }

  /** The floods on the public alert map: recorded in the last few days and not yet receded. */
  publicActive(): Promise<PublicFloodPoint[]> {
    return this.extents.findActive(SURVEY_LIMITS.publicFloodDays, SURVEY_LIMITS.publicFloodLimit);
  }

  list(query: LayerGeoJsonQuery): Promise<FloodExtentFeatureCollection> {
    return this.extents.findGeoJson(query);
  }

  async impact(id: string): Promise<FloodImpact> {
    const impact = await this.extents.impactOf(id);
    if (!impact) throw new NotFoundError("Flood extent");
    return impact;
  }

  async recede(id: string, actor: AuthUser): Promise<FloodExtentDto> {
    const record = await this.extents.findById(id);
    if (!record) throw new NotFoundError("Flood extent");
    await assertRecordInRegion(this.regions, actor, record);
    if (record.recededAt) throw new ConflictError("This flood is already marked as receded");

    const updated = await this.extents.markReceded(id);
    // Someone else marked it between the read and the write.
    if (!updated) throw new ConflictError("This flood is already marked as receded");
    domainEvents.emit("flood.receded", { floodId: id });
    return updated;
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const record = await this.extents.findById(id);
    if (!record) throw new NotFoundError("Flood extent");
    assertMayDelete(actor, record.recordedBy);
    if (!(await this.extents.delete(id))) throw new NotFoundError("Flood extent");
    domainEvents.emit("flood.deleted", { floodId: id });
  }
}

/** What to show when the impact couldn't be read right after a save: the flood is stored, the counts are not. */
function emptyImpact(areaM2: number): FloodImpact {
  return {
    areaM2,
    buildings: 0,
    roadMetres: 0,
    facilities: { total: 0, items: [] },
    settlements: [],
    wards: [],
    drains: { total: 0, needAttention: 0, items: [] },
  };
}

import type { AuthUser } from "../../common/access/auth-user";
import { RegionAccess } from "../../common/access/region-access";
import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/app-error";
import { domainEvents } from "../../common/events/domain-events";
import { AdminUnitRepository } from "../admin-units/admin-unit.repository";
import type { IAdminUnitRepository } from "../admin-units/admin-unit.types";
import { AuditService } from "../audit/audit.service";
import { PhotoService } from "../photos/photo.service";
import type { LayerGeoJsonQuery } from "../map-layers/map-layer.types";
import { FloodExtentRepository } from "./flood-extent.repository";
import type {
  FloodExtentDto,
  FloodExtentFeatureCollection,
  FloodExtentWithImpact,
  FloodHistory,
  FloodImpact,
  FloodImpactFeatureCollection,
  FloodPeople,
  IFloodExtentRepository,
  PublicFloodPoint,
} from "./field-survey.types";
import type { CreateFloodExtentBody } from "./field-survey.validation";
import { assertMayDelete, assertRecordInRegion, locateSurvey } from "./survey-location";
import { SURVEY_LIMITS } from "./survey-rules";

const { min, max } = SURVEY_LIMITS.extentAreaM2;

/**
 * Flood extents: the reach of a flood, recorded on the ground. Responders, officials and administrators
 * walk (or draw) its edge; everyone signed in sees it on the map, with what it reaches. The route's
 * requirePermission() is the role check; region scope is checked here, because it needs the area
 * hierarchy. Recording and receding are open to anyone in scope with the permission (a flood is
 * everyone's to report and to call over); deleting is for whoever recorded it (survey.delete_own), or
 * anyone with survey.delete_any. Every change is in the activity log, with who made it. Each change is announced
 * (flood.recorded, flood.receded, flood.deleted) so the public alert map, which shows the floods that
 * are still going, is refreshed for everyone watching it.
 */
export class FloodExtentService {
  private static _instance?: FloodExtentService;
  static get Instance(): FloodExtentService {
    return (this._instance ??= new FloodExtentService(
      FloodExtentRepository.Instance,
      AdminUnitRepository.Instance,
      RegionAccess.Instance,
      AuditService.Instance,
      PhotoService.Instance,
    ));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly extents: IFloodExtentRepository,
    private readonly units: Pick<IAdminUnitRepository, "findContaining" | "findSummaryById">,
    private readonly regions: Pick<RegionAccess, "assert">,
    private readonly audit: Pick<AuditService, "record">,
    private readonly photos: Pick<PhotoService, "removeAllFor">,
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
    await this.audit.record(actor, {
      action: "flood.recorded",
      entityType: "flood_extent",
      entityId: extent.id,
      lgaId: extent.lgaId,
      wardId: extent.wardId,
      summary: `Recorded a flood of ${hectares(extent.areaM2)}${extent.depth ? `, ${extent.depth}-deep` : ""} (${extent.method})`,
      details: { areaM2: extent.areaM2, depth: extent.depth, method: extent.method, accuracyM: extent.accuracyM },
    });
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

  /** The buildings, road stretches and facilities inside a flood, as shapes to draw over it. */
  async impactFeatures(id: string): Promise<FloodImpactFeatureCollection> {
    const features = await this.extents.impactFeatures(id);
    if (!features) throw new NotFoundError("Flood extent");
    return features;
  }

  /** Who recorded it and who called it over. Staff-only (survey.view_people on the route). */
  async people(id: string): Promise<FloodPeople> {
    const people = await this.extents.findPeople(id);
    if (!people) throw new NotFoundError("Flood extent");
    return people;
  }

  async recede(id: string, actor: AuthUser): Promise<FloodExtentDto> {
    const record = await this.extents.findById(id);
    if (!record) throw new NotFoundError("Flood extent");
    await assertRecordInRegion(this.regions, actor, record);
    if (record.recededAt) throw new ConflictError("This flood is already marked as receded");

    const updated = await this.extents.markReceded(id, actor.id);
    // Someone else marked it between the read and the write.
    if (!updated) throw new ConflictError("This flood is already marked as receded");
    await this.audit.record(actor, {
      action: "flood.receded",
      entityType: "flood_extent",
      entityId: id,
      lgaId: updated.lgaId,
      wardId: updated.wardId,
      summary: `Marked a flood of ${hectares(updated.areaM2)} as receded`,
    });
    domainEvents.emit("flood.receded", { floodId: id });
    return updated;
  }

  /** Puts a flood marked receded back as still going: for a slip of the finger, or water that came back. Same who-may-act rules as receding it. */
  async reopen(id: string, actor: AuthUser): Promise<FloodExtentDto> {
    const record = await this.extents.findById(id);
    if (!record) throw new NotFoundError("Flood extent");
    await assertRecordInRegion(this.regions, actor, record);
    if (!record.recededAt) throw new ConflictError("This flood isn't marked as receded");

    const updated = await this.extents.markActive(id, actor.id);
    // Someone else reopened it between the read and the write.
    if (!updated) throw new ConflictError("This flood isn't marked as receded");
    await this.audit.record(actor, {
      action: "flood.reopened",
      entityType: "flood_extent",
      entityId: id,
      lgaId: updated.lgaId,
      wardId: updated.wardId,
      summary: `Put a flood of ${hectares(updated.areaM2)} back as still going`,
    });
    domainEvents.emit("flood.reopened", { floodId: id });
    return updated;
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const record = await this.extents.findById(id);
    if (!record) throw new NotFoundError("Flood extent");
    await assertMayDelete(actor, record.recordedBy);
    // Its photos' files go first: the rows go with the flood, and a file with no row could never be found again.
    await this.photos.removeAllFor({ floodExtentId: id });
    if (!(await this.extents.delete(id))) throw new NotFoundError("Flood extent");
    await this.audit.record(actor, {
      action: "flood.deleted",
      entityType: "flood_extent",
      entityId: id,
      lgaId: record.lgaId,
      wardId: record.wardId,
      summary: `Deleted a flood record${record.recededAt ? " (it had receded)" : ""}`,
      details: { recordedBy: record.recordedBy },
    });
    domainEvents.emit("flood.deleted", { floodId: id });
  }
}

/** "3.2 ha", or square metres for something smaller than a tenth of a hectare. */
function hectares(areaM2: number): string {
  return areaM2 >= 1000 ? `${(areaM2 / 10_000).toFixed(1)} ha` : `${Math.round(areaM2)} m²`;
}

/** What to show when the impact couldn't be read right after a save: the flood is stored, the counts are not. */
function emptyImpact(areaM2: number): FloodImpact {
  return {
    areaM2,
    buildings: 0,
    households: 0,
    roadMetres: 0,
    facilities: { total: 0, items: [] },
    settlements: [],
    wards: [],
    drains: { total: 0, needAttention: 0, items: [] },
  };
}

import type { AuthUser } from "../../common/access/auth-user";
import { RegionAccess } from "../../common/access/region-access";
import { NotFoundError, ValidationError } from "../../common/errors/app-error";
import { domainEvents } from "../../common/events/domain-events";
import { AdminUnitRepository } from "../admin-units/admin-unit.repository";
import type { IAdminUnitRepository } from "../admin-units/admin-unit.types";
import { AuditService } from "../audit/audit.service";
import type { LayerGeoJsonQuery } from "../map-layers/map-layer.types";
import { PhotoService } from "../photos/photo.service";
import { parseDrainagePlan } from "./drainage-import";
import { DrainageRepository } from "./drainage.repository";
import type {
  DrainageDto,
  DrainageFeatureCollection,
  DrainageImportReport,
  DrainageSummary,
  DrainInspectionDto,
  DrainPeople,
  IDrainageRepository,
} from "./field-survey.types";
import type { CreateDrainageBody, UpdateDrainageBody } from "./field-survey.validation";
import { assertMayDelete, assertRecordInRegion, locateSurvey } from "./survey-location";
import { SURVEY_LIMITS, type DrainageCondition } from "./survey-rules";

const { min, max } = SURVEY_LIMITS.drainLengthM;

const CONDITION_WORDS: Record<DrainageCondition, string> = {
  clear: "clear",
  partly_blocked: "partly blocked",
  blocked: "blocked",
  overflowing: "overflowing",
  damaged: "damaged",
};

const KIND_WORDS = { open_drain: "drain", covered_drain: "covered drain", culvert: "culvert", outfall: "outfall", inlet: "inlet", retention_pond: "pond" } as const;

/** "Aba Road drain", or its kind when nobody named it: how the activity log names a drain. */
const titleOf = (drain: { name: string | null; kind: keyof typeof KIND_WORDS }) => drain.name ?? `a ${KIND_WORDS[drain.kind]}`;

/**
 * Drainage: the drains, culverts, outfalls, inlets and ponds that carry water away, and what shape
 * they are in. Who may record, inspect, delete or import is a permission on the route (and, for
 * deleting, here); region scope is checked here, because it needs the area hierarchy. The point of the
 * layer is that anyone passing a blocked drain can say so, and the next person can say it is clear, so
 * every inspection is kept (drain_inspections): who looked, what they found, and how far away they
 * stood. Names are for staff with survey.view_people; everyone signed in sees the layer.
 */
export class DrainageService {
  private static _instance?: DrainageService;
  static get Instance(): DrainageService {
    return (this._instance ??= new DrainageService(
      DrainageRepository.Instance,
      AdminUnitRepository.Instance,
      RegionAccess.Instance,
      AuditService.Instance,
      PhotoService.Instance,
    ));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly drains: IDrainageRepository,
    private readonly units: Pick<IAdminUnitRepository, "findContaining" | "findSummaryById">,
    private readonly regions: Pick<RegionAccess, "assert">,
    private readonly audit: Pick<AuditService, "record">,
    private readonly photos: Pick<PhotoService, "removeAllFor">,
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
      flowDirection: input.flowDirection ?? null,
      diameterM: input.diameterM ?? null,
      material: input.material ?? null,
      barrels: input.barrels ?? null,
      points: input.points,
      recordedBy: actor.id,
    });
    // A walked drain the database measured as shorter or longer than a drain can be.
    if (!drain) {
      throw new ValidationError([{ field: "points", message: `The drain is shorter than ${min} m or longer than ${max / 1000} km. Check the points and try again.` }]);
    }
    await this.audit.record(actor, {
      action: "drain.recorded",
      entityType: "drain",
      entityId: drain.id,
      lgaId: drain.lgaId,
      wardId: drain.wardId,
      summary: `Recorded ${titleOf(drain)} (${CONDITION_WORDS[drain.condition]})`,
      details: { kind: drain.kind, condition: drain.condition, method: drain.method, lengthM: drain.lengthM },
    });
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

  /**
   * An inspection: changes what was sent, keeps the rest, moves "last checked" to now and to this person,
   * and keeps a record of it (who, what they found before and after, and where they stood) in the same
   * statement. Sending nothing but the place is a check that found it as it was.
   */
  async update(id: string, input: UpdateDrainageBody, actor: AuthUser): Promise<DrainageDto & { inspectionId: string }> {
    const record = await this.drains.findById(id);
    if (!record) throw new NotFoundError("Drainage");
    await assertRecordInRegion(this.regions, actor, record);

    const result = await this.drains.inspect(
      id,
      {
        condition: input.condition ?? record.condition,
        name: input.name === undefined ? record.name : input.name || null,
        widthM: input.widthM === undefined ? record.widthM : input.widthM,
        depthM: input.depthM === undefined ? record.depthM : input.depthM,
        note: input.note === undefined ? record.note : input.note || null,
        flowDirection: input.flowDirection === undefined ? record.flowDirection : input.flowDirection,
        diameterM: input.diameterM === undefined ? record.diameterM : input.diameterM,
        material: input.material === undefined ? record.material : input.material,
        barrels: input.barrels === undefined ? record.barrels : input.barrels,
      },
      {
        inspectedBy: actor.id,
        inspectorName: actor.displayName ?? actor.email,
        inspectorRole: actor.role,
        conditionBefore: record.condition,
        note: input.inspectionNote || null,
        point: input.at ? [input.at.longitude, input.at.latitude] : null,
        accuracyM: input.at?.accuracyM ?? null,
      },
    );
    if (!result) throw new NotFoundError("Drainage");
    const { drain, inspectionId, distanceM } = result;
    const change = record.condition === drain.condition ? `still ${CONDITION_WORDS[drain.condition]}` : `${CONDITION_WORDS[record.condition]} → ${CONDITION_WORDS[drain.condition]}`;
    await this.audit.record(actor, {
      action: "drain.inspected",
      entityType: "drain",
      entityId: id,
      lgaId: drain.lgaId,
      wardId: drain.wardId,
      summary: `Inspected ${titleOf(drain)}: ${change}${distanceM !== null ? `, from ${Math.round(distanceM)} m away` : ""}`,
      details: { inspectionId, conditionBefore: record.condition, conditionAfter: drain.condition, distanceM, note: input.inspectionNote || null },
    });
    domainEvents.emit("drain.inspected", { drainId: id });
    return { ...drain, inspectionId };
  }

  /** Who checked it and what they found, newest first. Staff-only (survey.view_people on the route). */
  async inspections(id: string, limit: number): Promise<DrainInspectionDto[]> {
    if (!(await this.drains.findById(id))) throw new NotFoundError("Drainage");
    return this.drains.findInspections(id, limit);
  }

  /** Who recorded it and who last checked it. Staff-only (survey.view_people on the route). */
  async people(id: string): Promise<DrainPeople> {
    const people = await this.drains.findPeople(id);
    if (!people) throw new NotFoundError("Drainage");
    return people;
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const record = await this.drains.findById(id);
    if (!record) throw new NotFoundError("Drainage");
    await assertMayDelete(actor, record.recordedBy);
    // Its photos' files go first: the rows go with the drain, and a file with no row could never be found again.
    await this.photos.removeAllFor({ drainId: id });
    if (!(await this.drains.delete(id))) throw new NotFoundError("Drainage");
    await this.audit.record(actor, {
      action: "drain.deleted",
      entityType: "drain",
      entityId: id,
      lgaId: record.lgaId,
      wardId: record.wardId,
      summary: `Deleted ${titleOf(record)} (it was ${CONDITION_WORDS[record.condition]})`,
      details: { kind: record.kind, condition: record.condition, recordedBy: record.recordedBy },
    });
    domainEvents.emit("drain.deleted", { drainId: id });
  }

  /**
   * Loads a drainage plan (GeoJSON) for a country: each drain is checked here, then built, measured and
   * filed under its ward in PostGIS. Loading the same plan again adds nothing twice. Drains the plan gives
   * no condition for are dated by the plan, so the map shows them as not yet checked.
   */
  async importPlan(file: { fileName: string; buffer: Buffer }, input: { countryCode: string; wardLevel: number; planDate: string }, actor: AuthUser): Promise<DrainageImportReport> {
    const plan = parseDrainagePlan(file.buffer, file.fileName, input.planDate);
    const stored = await this.drains.importMany(plan.drains, { countryCode: input.countryCode, recordedBy: actor.id, wardLevel: input.wardLevel });
    const rejected = { ...plan.rejected };
    for (const [reason, count] of Object.entries(stored.rejected)) rejected[reason] = (rejected[reason] ?? 0) + count;
    const report: DrainageImportReport = { featuresInFile: plan.featuresInFile, inserted: stored.inserted, alreadyPresent: stored.alreadyPresent, rejected };
    if (stored.inserted > 0) {
      await this.audit.record(actor, {
        action: "drain.imported",
        entityType: "drain",
        entityId: null,
        summary: `Imported ${stored.inserted.toLocaleString("en")} drains from ${file.fileName}`,
        details: { file: file.fileName, countryCode: input.countryCode, ...report },
      });
      domainEvents.emit("drain.recorded", { drainId: "import" });
    }
    return report;
  }
}

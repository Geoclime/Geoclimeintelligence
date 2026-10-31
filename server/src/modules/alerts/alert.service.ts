import type { AuthUser } from "../../common/access/auth-user";
import { domainEvents } from "../../common/events/domain-events";
import { RegionAccess } from "../../common/access/region-access";
import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/app-error";
import { AdminUnitRepository } from "../admin-units/admin-unit.repository";
import type { IAdminUnitRepository } from "../admin-units/admin-unit.types";
import { AlertRepository } from "./alert.repository";
import { ALERT_AREA_LEVELS, toAlertDto, type FloodAlertDto, type IAlertRepository } from "./alert.types";
import { MAX_DURATION_DAYS, type CreateAlertBody, type ListAlertsQuery, type UpdateAlertBody } from "./alert.validation";

const LIST_LIMIT = 100;

/**
 * Flood alerts. Anyone may read them (they are public warnings). Issuing, editing, ending and
 * deleting one is for government officials and administrators (the route's authorise()), and only
 * for areas inside their region scope (checked here, per area, section 7).
 */
export class AlertService {
  private static _instance?: AlertService;
  static get Instance(): AlertService {
    return (this._instance ??= new AlertService(AlertRepository.Instance, AdminUnitRepository.Instance, RegionAccess.Instance));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly alerts: IAlertRepository,
    private readonly units: Pick<IAdminUnitRepository, "findSummaryById">,
    private readonly regions: Pick<RegionAccess, "assert">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list({ view }: ListAlertsQuery): Promise<FloodAlertDto[]> {
    const rows = await this.alerts.findList({ view, limit: LIST_LIMIT });
    const now = this.now();
    return rows.map((row) => toAlertDto(row, now));
  }

  async create(body: CreateAlertBody, user: AuthUser): Promise<FloodAlertDto> {
    const areaIds = await this.checkAreas(body.areaIds, user);

    const id = await this.alerts.create({
      severity: body.severity,
      title: body.title,
      message: body.message,
      actions: body.actions,
      startsAt: body.startsAt ? new Date(body.startsAt) : this.now(),
      expiresAt: new Date(body.expiresAt),
      areaIds,
      createdBy: user.id,
    });
    domainEvents.emit("alert.issued", { alertId: id, issuerId: user.id });
    return this.get(id);
  }

  /** Ends an alert before it expires. The issuer needs access to every area it covers. */
  async end(id: string, user: AuthUser): Promise<FloodAlertDto> {
    const alert = await this.get(id);
    if (alert.status === "ended" || alert.status === "expired") throw new ConflictError("This alert is no longer in force");
    for (const area of alert.areas) await this.regions.assert(user, area.id);
    await this.alerts.end(id, this.now());
    domainEvents.emit("alert.ended", { alertId: id });
    return this.get(id);
  }

  /**
   * Changes an alert that is still in force or scheduled. One that has ended or expired is a
   * record of what happened, so it is left alone (delete it, or issue a new one). The editor needs
   * access to every area the alert covers now, and to any area they add.
   */
  async update(id: string, body: UpdateAlertBody, user: AuthUser): Promise<FloodAlertDto> {
    const alert = await this.get(id);
    if (alert.status === "ended" || alert.status === "expired") {
      throw new ConflictError("This alert has already ended, so it can't be edited. Issue a new one instead.");
    }
    for (const area of alert.areas) await this.regions.assert(user, area.id);
    const areaIds = body.areaIds ? await this.checkAreas(body.areaIds, user) : undefined;
    const expiresAt = body.expiresAt ? this.checkEnd(new Date(body.expiresAt), new Date(alert.startsAt)) : undefined;

    await this.alerts.update(id, {
      severity: body.severity,
      title: body.title,
      message: body.message,
      actions: body.actions,
      expiresAt,
      areaIds,
    });
    domainEvents.emit("alert.updated", { alertId: id, editorId: user.id, notify: body.notify });
    return this.get(id);
  }

  /** Deletes an alert, in any state, and takes it off the map and every list at once. */
  async remove(id: string, user: AuthUser): Promise<void> {
    const alert = await this.get(id);
    for (const area of alert.areas) await this.regions.assert(user, area.id);
    await this.alerts.remove(id);
    domainEvents.emit("alert.deleted", { alertId: id });
  }

  /** Every area exists, is an LGA or a state, and is inside the user's region. Returns them without repeats. */
  private async checkAreas(ids: string[], user: AuthUser): Promise<string[]> {
    const areaIds = [...new Set(ids)];
    for (const [index, id] of areaIds.entries()) {
      const unit = await this.units.findSummaryById(id);
      if (!unit) throw new ValidationError([{ field: `areaIds.${index}`, message: "No area with this id exists" }]);
      if (!(ALERT_AREA_LEVELS as readonly number[]).includes(unit.level)) {
        throw new ValidationError([{ field: `areaIds.${index}`, message: `Alerts cover LGAs or states, not a ${unit.levelName.toLowerCase()}` }]);
      }
      await this.regions.assert(user, id);
    }
    return areaIds;
  }

  /** A new end time must be after the later of the alert's start and now, and within the longest an alert may last. */
  private checkEnd(expiresAt: Date, startsAt: Date): Date {
    const from = new Date(Math.max(startsAt.getTime(), this.now().getTime()));
    if (expiresAt <= from) {
      throw new ValidationError([{ field: "expiresAt", message: "The alert must end after it starts, and after now" }]);
    }
    if (expiresAt.getTime() - startsAt.getTime() > MAX_DURATION_DAYS * 86_400_000) {
      throw new ValidationError([{ field: "expiresAt", message: `An alert can last at most ${MAX_DURATION_DAYS} days` }]);
    }
    return expiresAt;
  }

  private async get(id: string): Promise<FloodAlertDto> {
    const row = await this.alerts.findAlert(id);
    if (!row) throw new NotFoundError("Alert");
    return toAlertDto(row, this.now());
  }
}

import type { AuthUser } from "../../common/access/auth-user";
import { RegionAccess } from "../../common/access/region-access";
import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/app-error";
import { AdminUnitRepository } from "../admin-units/admin-unit.repository";
import type { IAdminUnitRepository } from "../admin-units/admin-unit.types";
import { AlertRepository } from "./alert.repository";
import { ALERT_AREA_LEVELS, toAlertDto, type FloodAlertDto, type IAlertRepository } from "./alert.types";
import type { CreateAlertBody, ListAlertsQuery } from "./alert.validation";

const LIST_LIMIT = 100;

/**
 * Flood alerts. Anyone may read them (they are public warnings). Issuing and ending one is for
 * government officials and administrators (the route's authorise()), and only for areas inside
 * the issuer's region scope (checked here, per area, section 7).
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
    const areaIds = [...new Set(body.areaIds)];
    for (const [index, id] of areaIds.entries()) {
      const unit = await this.units.findSummaryById(id);
      if (!unit) throw new ValidationError([{ field: `areaIds.${index}`, message: "No area with this id exists" }]);
      if (!(ALERT_AREA_LEVELS as readonly number[]).includes(unit.level)) {
        throw new ValidationError([{ field: `areaIds.${index}`, message: `Alerts cover LGAs or states, not a ${unit.levelName.toLowerCase()}` }]);
      }
      await this.regions.assert(user, id);
    }

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
    return this.get(id);
  }

  /** Ends an alert before it expires. The issuer needs access to every area it covers. */
  async end(id: string, user: AuthUser): Promise<FloodAlertDto> {
    const alert = await this.get(id);
    if (alert.status === "ended" || alert.status === "expired") throw new ConflictError("This alert is no longer in force");
    for (const area of alert.areas) await this.regions.assert(user, area.id);
    await this.alerts.end(id, this.now());
    return this.get(id);
  }

  private async get(id: string): Promise<FloodAlertDto> {
    const row = await this.alerts.findAlert(id);
    if (!row) throw new NotFoundError("Alert");
    return toAlertDto(row, this.now());
  }
}

import { NotFoundError } from "../../common/errors/app-error";
import { AdminUnitRepository } from "../admin-units/admin-unit.repository";
import { toRef, type IAdminUnitRepository } from "../admin-units/admin-unit.types";
import { DataSourceRepository } from "../data-sources/data-source.repository";
import { toDataSourceDto, type IDataSourceRepository } from "../data-sources/data-source.types";
import { RainfallRepository } from "./rainfall.repository";
import type { IRainfallRepository, RainfallSeriesDto } from "./rainfall.types";
import type { GetRainfallQuery } from "./rainfall.validation";

/**
 * Read-only rainfall for every signed-in user. Like the areas it belongs to, rainfall is shared
 * reference data, not a region-owned record, so reads are not narrowed by a user's region scope.
 * It is written only by the import pipeline's promotion step.
 */
export class RainfallService {
  private static _instance?: RainfallService;
  static get Instance(): RainfallService {
    return (this._instance ??= new RainfallService(RainfallRepository.Instance, AdminUnitRepository.Instance, DataSourceRepository.Instance));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly rainfall: Pick<IRainfallRepository, "findSeries">,
    private readonly units: Pick<IAdminUnitRepository, "findSummaryById">,
    private readonly sources: Pick<IDataSourceRepository, "findById">,
  ) {}

  /** One area's monthly series, oldest first. An area with no rainfall yet gets an empty series, not a 404. */
  async series(query: GetRainfallQuery): Promise<RainfallSeriesDto> {
    const unit = await this.units.findSummaryById(query.adminUnitId);
    if (!unit) throw new NotFoundError("Admin unit");

    const rows = await this.rainfall.findSeries(query.adminUnitId, { from: query.from, to: query.to });
    const sourceIds = [...new Set(rows.map((row) => row.sourceId))];
    const sources = await Promise.all(sourceIds.map((id) => this.sources.findById(id)));

    return {
      adminUnit: toRef(unit),
      months: rows.map(({ yearMonth, rainfallMm }) => ({ yearMonth, rainfallMm })),
      dataTypes: [...new Set(rows.map((row) => row.dataType))],
      sources: sources.filter((source) => source !== null).map(toDataSourceDto),
    };
  }
}

import { AppError, NotFoundError } from "../../common/errors/app-error";
import type { PageMeta } from "../../common/response/api-response";
import { DataSourceRepository } from "../data-sources/data-source.repository";
import { toDataSourceDto, type IDataSourceRepository } from "../data-sources/data-source.types";
import { AdminUnitRepository } from "./admin-unit.repository";
import {
  toRef,
  type AdminUnitDetail,
  type AdminUnitFeatureCollection,
  type AdminUnitSummary,
  type IAdminUnitRepository,
  type LocateResult,
} from "./admin-unit.types";
import type { AdminUnitGeoJsonQuery, ListAdminUnitsQuery, ListChildrenQuery, LocateQuery } from "./admin-unit.validation";

/**
 * Read-only geography for every signed-in user. Areas are shared reference data (the map
 * itself), not region-owned records, so reads are not narrowed by a user's region scope;
 * the scope restricts what a user may do to records inside an area, not which areas exist.
 * Areas are written only by the import pipeline's promotion step.
 */
export class AdminUnitService {
  private static _instance?: AdminUnitService;
  static get Instance(): AdminUnitService {
    return (this._instance ??= new AdminUnitService(AdminUnitRepository.Instance, DataSourceRepository.Instance));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly units: IAdminUnitRepository,
    private readonly sources: Pick<IDataSourceRepository, "findById">,
  ) {}

  list(query: ListAdminUnitsQuery): Promise<{ items: AdminUnitSummary[]; meta: PageMeta }> {
    return this.units.findSummaries(query);
  }

  async getById(id: string): Promise<AdminUnitDetail> {
    const unit = await this.units.findSummaryById(id);
    if (!unit) throw new NotFoundError("Admin unit");

    const [parent, source, geometry] = await Promise.all([
      unit.parentId ? this.units.findSummaryById(unit.parentId) : Promise.resolve(null),
      this.sources.findById(unit.sourceId),
      this.units.findGeometry(id),
    ]);
    if (!geometry) throw new NotFoundError("Admin unit");

    return {
      ...unit,
      parent: parent ? toRef(parent) : null,
      source: source ? toDataSourceDto(source) : null,
      geometry,
    };
  }

  async children(id: string, query: ListChildrenQuery): Promise<{ items: AdminUnitSummary[]; meta: PageMeta }> {
    if (!(await this.units.exists(id))) throw new NotFoundError("Admin unit");
    return this.units.findSummaries({ parentId: id, page: query.page, pageSize: query.pageSize });
  }

  geoJson(query: AdminUnitGeoJsonQuery): Promise<AdminUnitFeatureCollection> {
    return this.units.findGeoJson(query);
  }

  /** "Which state, LGA and ward is this point in?" -- the Phase 2 point-in-polygon test. */
  async locate(query: LocateQuery): Promise<LocateResult> {
    const units = await this.units.findContaining(query.lon, query.lat, query.level);
    if (units.length === 0) throw new AppError(404, "No mapped area contains this point");
    return { point: [query.lon, query.lat], units: units.map(toRef) };
  }
}

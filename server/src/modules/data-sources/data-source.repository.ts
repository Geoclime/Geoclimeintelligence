import { AppError } from "../../common/errors/app-error";
import type { OffsetPageQuery } from "../../common/pagination/pagination";
import { BaseRepository } from "../../common/repository/base.repository";
import type { PageMeta } from "../../common/response/api-response";
import { DataSourceRecord } from "./data-source.entity";
import type { IDataSourceRepository, NewDataSource } from "./data-source.types";

const FOREIGN_KEY_VIOLATION = "23503";

export class DataSourceRepository extends BaseRepository<DataSourceRecord> implements IDataSourceRepository {
  private static _instance?: DataSourceRepository;
  static get Instance(): DataSourceRepository {
    return (this._instance ??= new DataSourceRepository());
  }

  protected readonly entity = DataSourceRecord;

  override findPage(query: OffsetPageQuery): Promise<{ items: DataSourceRecord[]; meta: PageMeta }> {
    return super.findPage({ ...query, order: { createdAt: "DESC", id: "DESC" } });
  }

  async create(input: NewDataSource): Promise<DataSourceRecord> {
    const saved = await this.repo.save(this.repo.create(input));
    // Re-read so database defaults (created_at) come back in their stored form.
    const source = await this.findById(saved.id);
    if (!source) throw new AppError(500, "Data source could not be created");
    return source;
  }

  async deleteIfUnused(id: string): Promise<boolean> {
    // admin_units, roads, waterways, settlement_points, infrastructure, buildings, import_runs and countries all reference
    // data_sources with ON DELETE RESTRICT, so the database refuses a source that is still in use.
    // That is reported as false rather than surfacing as a raw foreign-key error.
    try {
      const result = await this.repo.delete({ id });
      return (result.affected ?? 0) > 0;
    } catch (err) {
      const candidate = err as { code?: unknown; driverError?: { code?: unknown } } | null;
      if ((candidate?.code ?? candidate?.driverError?.code) === FOREIGN_KEY_VIOLATION) return false;
      throw err;
    }
  }
}

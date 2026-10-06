import { AppError } from "../../common/errors/app-error";
import type { OffsetPageQuery } from "../../common/pagination/pagination";
import { BaseRepository } from "../../common/repository/base.repository";
import type { PageMeta } from "../../common/response/api-response";
import { DataSourceRecord } from "./data-source.entity";
import type { IDataSourceRepository, NewDataSource } from "./data-source.types";

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
}

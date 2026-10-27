import type { AuthUser } from "../../common/access/auth-user";
import { ConflictError, NotFoundError } from "../../common/errors/app-error";
import type { OffsetPageQuery } from "../../common/pagination/pagination";
import type { PageMeta } from "../../common/response/api-response";
import { DataSourceRepository } from "./data-source.repository";
import { toDataSourceDto, type DataSourceDto, type IDataSourceRepository } from "./data-source.types";
import type { CreateDataSourceBody } from "./data-source.validation";

/**
 * Phase 2's minimal data-sources feature: list, create and delete. Phase 3 adds editing, datasets and
 * the rest of the provenance columns. Writes are Administrator-only (authorise on the route);
 * sources are not region data, so no region check applies.
 */
export class DataSourceService {
  private static _instance?: DataSourceService;
  static get Instance(): DataSourceService {
    return (this._instance ??= new DataSourceService(DataSourceRepository.Instance));
  }

  // Public so tests can inject a fake repository; application code always uses .Instance.
  constructor(private readonly sources: IDataSourceRepository) {}

  async list(query: OffsetPageQuery): Promise<{ items: DataSourceDto[]; meta: PageMeta }> {
    const { items, meta } = await this.sources.findPage(query);
    return { items: items.map(toDataSourceDto), meta };
  }

  async create(input: CreateDataSourceBody, actor: AuthUser): Promise<DataSourceDto> {
    const source = await this.sources.create({ ...input, createdBy: actor.id });
    return toDataSourceDto(source);
  }

  /** Only a source nothing points at can go; one in use keeps the provenance of its data. */
  async delete(id: string): Promise<void> {
    const existing = await this.sources.findById(id);
    if (!existing) throw new NotFoundError("Data source");

    if (!(await this.sources.deleteIfUnused(id))) {
      throw new ConflictError(
        `${existing.provider}: ${existing.datasetName} is used by imported areas, map layers or imports, so it can't be deleted`,
      );
    }
  }
}

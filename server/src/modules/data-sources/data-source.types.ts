import type { OffsetPageQuery } from "../../common/pagination/pagination";
import type { PageMeta } from "../../common/response/api-response";
import type { DataSourceRecord } from "./data-source.entity";

export interface NewDataSource {
  provider: string;
  datasetName: string;
  url: string;
  license: string;
  downloadedOn: string;
  notes: string | null;
  createdBy: string;
}

/** What services depend on, so they can be unit-tested with an in-memory fake (section 2). */
export interface IDataSourceRepository {
  findById(id: string): Promise<DataSourceRecord | null>;
  findPage(query: OffsetPageQuery): Promise<{ items: DataSourceRecord[]; meta: PageMeta }>;
  create(input: NewDataSource): Promise<DataSourceRecord>;
}

export interface DataSourceDto {
  id: string;
  provider: string;
  datasetName: string;
  url: string;
  license: string;
  downloadedOn: string;
  notes: string | null;
  createdAt: string;
}

export function toDataSourceDto(source: DataSourceRecord): DataSourceDto {
  return {
    id: source.id,
    provider: source.provider,
    datasetName: source.datasetName,
    url: source.url,
    license: source.license,
    downloadedOn: source.downloadedOn,
    notes: source.notes,
    createdAt: source.createdAt.toISOString(),
  };
}

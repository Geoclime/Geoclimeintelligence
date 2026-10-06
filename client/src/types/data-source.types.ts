/** Mirrors DataSourceDto in server/src/modules/data-sources/data-source.types.ts. */
export interface DataSource {
  id: string;
  provider: string;
  datasetName: string;
  url: string;
  license: string;
  /** YYYY-MM-DD. */
  downloadedOn: string;
  notes: string | null;
  createdAt: string;
}

/** Body for POST /api/v1/data-sources (Administrator only). */
export interface NewDataSourceInput {
  provider: string;
  datasetName: string;
  url: string;
  license: string;
  downloadedOn: string;
  notes?: string | null;
}

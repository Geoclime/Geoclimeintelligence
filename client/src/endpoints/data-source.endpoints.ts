import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type { DataSource, NewDataSourceInput } from "../types/data-source.types";

// server/src/modules/data-sources/data-source.routes.ts. Reads: any signed-in user.
// Adding or deleting a source: Administrators only.

export async function fetchDataSources(params: { page: number; pageSize: number }): Promise<ApiResponse<DataSource[]>> {
  const { data } = await httpClient.get<ApiResponse<DataSource[]>>("/api/v1/data-sources", { params });
  return data;
}

export async function createDataSource(input: NewDataSourceInput): Promise<ApiResponse<DataSource>> {
  const { data } = await httpClient.post<ApiResponse<DataSource>>("/api/v1/data-sources", input);
  return data;
}

/** 409 when areas, map layers or imports still point at the source. */
export async function deleteDataSource(id: string): Promise<ApiResponse<null>> {
  const { data } = await httpClient.delete<ApiResponse<null>>(`/api/v1/data-sources/${encodeURIComponent(id)}`);
  return data;
}

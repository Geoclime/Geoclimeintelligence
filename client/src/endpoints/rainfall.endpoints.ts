import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type { RainfallSeries } from "../types/rainfall.types";

// server/src/modules/rainfall/rainfall.routes.ts. Any signed-in user may call this.

/** One area's monthly rainfall, oldest first. `from`/`to` are "YYYY-MM", inclusive. */
export async function fetchRainfallSeries(adminUnitId: string, range: { from?: string; to?: string } = {}): Promise<ApiResponse<RainfallSeries>> {
  const { data } = await httpClient.get<ApiResponse<RainfallSeries>>("/api/v1/rainfall", { params: { adminUnitId, ...range } });
  return data;
}

import { httpClient } from "../transport/http";
import type { FloodAlert, NewAlertBody } from "../types/alert.types";
import type { ApiResponse } from "../types/api.types";

// server/src/modules/alerts/alert.routes.ts. Reading: any signed-in user. Issuing and ending:
// government officials and administrators, inside their region.

/** "active": in force now. "recent": also scheduled, and ended or expired in the last 30 days. */
export async function fetchAlerts(view: "active" | "recent"): Promise<ApiResponse<FloodAlert[]>> {
  const { data } = await httpClient.get<ApiResponse<FloodAlert[]>>("/api/v1/alerts", { params: { view } });
  return data;
}

export async function issueAlert(body: NewAlertBody): Promise<ApiResponse<FloodAlert>> {
  const { data } = await httpClient.post<ApiResponse<FloodAlert>>("/api/v1/alerts", body);
  return data;
}

/** Ends an alert before it expires. */
export async function endAlert(id: string): Promise<ApiResponse<FloodAlert>> {
  const { data } = await httpClient.post<ApiResponse<FloodAlert>>(`/api/v1/alerts/${encodeURIComponent(id)}/end`);
  return data;
}

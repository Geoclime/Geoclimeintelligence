import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type { AuditEvent, AuditFilters } from "../types/audit.types";

// server/src/modules/audit/audit.routes.ts. Needs the audit.view permission (administrators always have it).

const clean = (filters: AuditFilters) => Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== ""));

export async function fetchAuditEvents(filters: AuditFilters, page: number, pageSize = 25): Promise<ApiResponse<AuditEvent[]>> {
  const { data } = await httpClient.get<ApiResponse<AuditEvent[]>>("/api/v1/audit-events", { params: { ...clean(filters), page, pageSize } });
  return data;
}

/** The whole filtered log as a CSV file. */
export async function downloadAuditCsv(filters: AuditFilters): Promise<Blob> {
  const { data } = await httpClient.get<Blob>("/api/v1/audit-events/export.csv", { params: clean(filters), responseType: "blob", timeout: 120_000 });
  return data;
}

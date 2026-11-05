import { useCallback } from "react";
import { QUERY_KEYS } from "../cache/queryClient";
import { downloadAuditCsv, fetchAuditEvents } from "../endpoints/audit.endpoints";
import type { AuditFilters } from "../types/audit.types";
import { useLoader } from "./useLoader";

/** A page of the activity log, newest first. Never cached across screens: the log is only ever growing. */
export function useAuditLog(filters: AuditFilters, page: number, pageSize: number) {
  const { data, ...state } = useLoader([...QUERY_KEYS.audit, filters, page, pageSize], async () => fetchAuditEvents(filters, page, pageSize));
  return { events: data?.data ?? [], total: data?.meta?.total ?? 0, ...state };
}

/** The whole filtered log as a CSV file. */
export function useAuditExport() {
  return useCallback((filters: AuditFilters) => downloadAuditCsv(filters), []);
}

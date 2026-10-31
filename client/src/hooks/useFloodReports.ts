import { useCallback, useMemo } from "react";
import { QUERY_KEYS, LIVE_POLICY, REFERENCE_POLICY, invalidateQueries } from "../cache/queryClient";
import { deleteFloodReport, fetchFloodReports, fetchMyFloodReports, fetchReportMediaOptions, reviewFloodReport, submitFloodReport, updateFloodReport } from "../endpoints/flood-report.endpoints";
import type { PaginationMeta } from "../types/api.types";
import type { FloodReport, NewFloodReport, ReportListParams, ReportMediaOptions, UpdateFloodReport } from "../types/flood-report.types";
import { paginationDetails } from "../utils/pagination";
import { useLoader } from "./useLoader";

interface ReportPage {
  reports: FloodReport[];
  meta: PaginationMeta;
}

/** Which media the report form may offer, and their limits. Cached: it only changes with a server setting. */
export function useReportMediaOptions() {
  const key = [...QUERY_KEYS.public, "report-media-options"];
  const { data, ...state } = useLoader<ReportMediaOptions>(
    key,
    async () => {
      const response = await fetchReportMediaOptions();
      if (!response.data) throw new Error(response.message || "The server returned no options.");
      return response.data;
    },
    REFERENCE_POLICY,
  );
  return { options: data, ...state };
}

/** Sends a flood report. Rejects with an ApiError so the form can show a 400's field errors. A new report changes the review queue and the sender's own list. */
export function useSubmitFloodReport() {
  const submit = useCallback(async (report: NewFloodReport): Promise<FloodReport> => {
    const response = await submitFloodReport(report);
    if (!response.data) throw new Error(response.message || "The server returned no report.");
    invalidateQueries(QUERY_KEYS.reports);
    invalidateQueries(QUERY_KEYS.myReports);
    return response.data;
  }, []);
  return { submit };
}

/**
 * Editing and deleting a report. Either changes the review queue, the sender's own list and, for a
 * published report, the public alert map, so all three are asked for again. Both reject with an
 * ApiError (the edit form puts a 400's field errors on the right inputs).
 */
export function useFloodReportActions() {
  const refresh = useCallback(() => {
    invalidateQueries(QUERY_KEYS.reports);
    invalidateQueries(QUERY_KEYS.myReports);
    invalidateQueries(QUERY_KEYS.alerts);
  }, []);

  const update = useCallback(
    async (id: string, body: UpdateFloodReport): Promise<FloodReport> => {
      const response = await updateFloodReport(id, body);
      if (!response.data) throw new Error(response.message || "The server returned no report.");
      refresh();
      return response.data;
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await deleteFloodReport(id);
      refresh();
    },
    [refresh],
  );

  return { update, remove };
}

/** The signed-in user's own reports, newest first, with each one's review status. */
export function useMyFloodReports(page: number, pageSize = 10) {
  const { data, ...state } = useLoader<ReportPage>(
    [...QUERY_KEYS.myReports, page, pageSize],
    async () => {
      const response = await fetchMyFloodReports({ page, pageSize });
      return { reports: response.data ?? [], meta: response.meta ?? {} };
    },
    LIVE_POLICY,
  );
  return { reports: data?.reports ?? [], ...paginationDetails(data?.meta ?? {}), ...state };
}

/**
 * The review list for responders, officials and administrators: reports inside their region,
 * pending ones first come first served. Reviewing swaps the answered report in place.
 */
export function useFloodReports(params: ReportListParams) {
  const { status, page, pageSize } = params;
  const key = useMemo(() => [...QUERY_KEYS.reports, status ?? "all", page, pageSize], [status, page, pageSize]);
  const { data, setData, ...state } = useLoader<ReportPage>(
    key,
    async () => {
      const response = await fetchFloodReports({ status, page, pageSize });
      return { reports: response.data ?? [], meta: response.meta ?? {} };
    },
    LIVE_POLICY,
  );

  /** Rejects with an ApiError (e.g. 409 when someone else reviewed it first). */
  const review = useCallback(
    async (id: string, decision: "publish" | "reject", note?: string): Promise<FloodReport> => {
      const response = await reviewFloodReport(id, decision, note);
      if (!response.data) throw new Error(response.message || "The server returned no report.");
      const updated = response.data;
      // The report moves between tabs (and onto the public alert map once published), so every
      // other remembered list is stale. This one is updated in place.
      invalidateQueries(QUERY_KEYS.reports, key);
      invalidateQueries(QUERY_KEYS.myReports);
      invalidateQueries(QUERY_KEYS.alerts);
      setData((current) => current && { ...current, reports: current.reports.map((r) => (r.id === id ? updated : r)) });
      return updated;
    },
    [key, setData],
  );

  return { reports: data?.reports ?? [], ...paginationDetails(data?.meta ?? {}), ...state, review };
}

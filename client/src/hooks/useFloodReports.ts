import { useCallback } from "react";
import { CACHE_KEYS, cached } from "../cache/localCache";
import { fetchFloodReports, fetchMyFloodReports, fetchReportMediaOptions, reviewFloodReport, submitFloodReport } from "../endpoints/flood-report.endpoints";
import type { PaginationMeta } from "../types/api.types";
import type { FloodReport, NewFloodReport, ReportListParams, ReportMediaOptions } from "../types/flood-report.types";
import { paginationDetails } from "../utils/pagination";
import { useLoader } from "./useLoader";

interface ReportPage {
  reports: FloodReport[];
  meta: PaginationMeta;
}

/** Which media the report form may offer, and their limits. Cached: it only changes with a server setting. */
export function useReportMediaOptions() {
  const key = `${CACHE_KEYS.public}report-media-options`;
  const { data, ...state } = useLoader<ReportMediaOptions>(key, () =>
    cached(key, async () => {
      const response = await fetchReportMediaOptions();
      if (!response.data) throw new Error(response.message || "The server returned no options.");
      return response.data;
    }),
  );
  return { options: data, ...state };
}

/** Sends a flood report. Rejects with an ApiError so the form can show a 400's field errors. */
export function useSubmitFloodReport() {
  const submit = useCallback(async (report: NewFloodReport): Promise<FloodReport> => {
    const response = await submitFloodReport(report);
    if (!response.data) throw new Error(response.message || "The server returned no report.");
    return response.data;
  }, []);
  return { submit };
}

/** The signed-in user's own reports, newest first, with each one's review status. */
export function useMyFloodReports(page: number, pageSize = 10) {
  const { data, ...state } = useLoader<ReportPage>(`my-reports:${page}:${pageSize}`, async () => {
    const response = await fetchMyFloodReports({ page, pageSize });
    return { reports: response.data ?? [], meta: response.meta ?? {} };
  });
  return { reports: data?.reports ?? [], ...paginationDetails(data?.meta ?? {}), ...state };
}

/**
 * The review list for responders, officials and administrators: reports inside their region,
 * pending ones first come first served. Reviewing swaps the answered report in place.
 */
export function useFloodReports(params: ReportListParams) {
  const { status, page, pageSize } = params;
  const { data, setData, ...state } = useLoader<ReportPage>(`reports:${status ?? "all"}:${page}:${pageSize}`, async () => {
    const response = await fetchFloodReports({ status, page, pageSize });
    return { reports: response.data ?? [], meta: response.meta ?? {} };
  });

  /** Rejects with an ApiError (e.g. 409 when someone else reviewed it first). */
  const review = useCallback(
    async (id: string, decision: "publish" | "reject", note?: string): Promise<FloodReport> => {
      const response = await reviewFloodReport(id, decision, note);
      if (!response.data) throw new Error(response.message || "The server returned no report.");
      const updated = response.data;
      setData((current) => current && { ...current, reports: current.reports.map((r) => (r.id === id ? updated : r)) });
      return updated;
    },
    [setData],
  );

  return { reports: data?.reports ?? [], ...paginationDetails(data?.meta ?? {}), ...state, review };
}

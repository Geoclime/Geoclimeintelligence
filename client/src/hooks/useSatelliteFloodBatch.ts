import { useCallback, useRef, useState } from "react";
import { QUERY_KEYS, invalidateQueries } from "../cache/queryClient";
import { IS_E2E } from "../config/env";
import { fetchImportRuns, promoteImportRun } from "../endpoints/import.endpoints";
import { fetchSatelliteFloods, startSatelliteFloodImport } from "../endpoints/satellite-flood.endpoints";
import { errorMessage, toApiError } from "../transport/api-error";
import type { ImportRun } from "../types/import.types";
import { monthFromFileName } from "../utils/monthly-tiles";

/** One file of a batch: waiting, being checked, checked (a run), promoted, or refused with a reason. */
export interface BatchItem {
  fileName: string;
  yearMonth?: string | null;
  state: "waiting" | "checking" | "checked" | "promoting" | "promoted" | "failed";
  run: ImportRun | null;
  error: string | null;
}

export interface BatchInput {
  files: File[];
  countryCode: string;
  sourceId: string;
  /** Only for a single file whose name doesn't say its month. */
  yearMonth?: string;
}

export interface ExistingSatelliteMonth {
  yearMonth: string;
  state: "checked" | "promoted";
  run: ImportRun | null;
}

const RUN_PAGE_SIZE = 100;
const MAX_RUN_PAGES = 5;

/** True for a dropped connection, a timeout or a 5xx server blip: worth trying again automatically once. */
function isTransientFailure(error: unknown): boolean {
  if (IS_E2E) return false;
  const { kind, status } = toApiError(error);
  return kind === "network" || kind === "timeout" || (status !== null && status >= 500);
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function fetchAllSatelliteRuns(countryCode: string): Promise<ImportRun[]> {
  const first = await fetchImportRuns({ page: 1, pageSize: RUN_PAGE_SIZE });
  const all: ImportRun[] = [...(first.data ?? [])];
  const total = first.meta?.total ?? all.length;
  const totalPages = Math.min(MAX_RUN_PAGES, Math.ceil(total / RUN_PAGE_SIZE));
  if (totalPages > 1) {
    const pages = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        fetchImportRuns({ page: i + 2, pageSize: RUN_PAGE_SIZE }).catch(() => null),
      ),
    );
    for (const page of pages) {
      if (page?.data) all.push(...page.data);
    }
  }
  return all.filter(
    (run) =>
      run.target === "satellite_flood_layers" &&
      run.options.countryCode === countryCode &&
      run.passedCount > 0 &&
      run.errorCount === 0,
  );
}

/**
 * Looks up which months of satellite flood extent have already been checked or promoted for a
 * country, so re-selecting a folder skips files that were already imported.
 */
export async function fetchExistingSatelliteMonths(
  countryCode: string,
): Promise<{ byMonth: Map<string, ExistingSatelliteMonth>; byFileName: Map<string, ExistingSatelliteMonth> }> {
  const byMonth = new Map<string, ExistingSatelliteMonth>();
  const byFileName = new Map<string, ExistingSatelliteMonth>();
  if (!countryCode) return { byMonth, byFileName };

  const [liveRes, runs] = await Promise.all([
    fetchSatelliteFloods(countryCode).catch(() => null),
    fetchAllSatelliteRuns(countryCode).catch(() => [] as ImportRun[]),
  ]);

  const liveMonths = new Set((liveRes?.data?.months ?? []).map((m) => m.yearMonth));

  // Runs arrive newest-first. Prefer a promoted/live month; otherwise keep the newest checked run.
  for (const run of runs) {
    const ym = run.options.yearMonth ?? monthFromFileName(run.fileName);
    if (!ym) continue;
    const state: "checked" | "promoted" =
      run.status === "promoted" || liveMonths.has(ym) ? "promoted" : "checked";
    const existing = byMonth.get(ym);
    if (!existing || (existing.state !== "promoted" && state === "promoted")) {
      const entry: ExistingSatelliteMonth = { yearMonth: ym, state, run };
      byMonth.set(ym, entry);
      byFileName.set(run.fileName.toLowerCase(), entry);
    }
  }

  for (const layer of liveRes?.data?.months ?? []) {
    if (!byMonth.has(layer.yearMonth)) {
      byMonth.set(layer.yearMonth, { yearMonth: layer.yearMonth, state: "promoted", run: null });
    }
  }

  return { byMonth, byFileName };
}

function matchExistingFile(
  file: File,
  lookup: { byMonth: Map<string, ExistingSatelliteMonth>; byFileName: Map<string, ExistingSatelliteMonth> },
): ExistingSatelliteMonth | null {
  const ym = monthFromFileName(file.name);
  if (ym && lookup.byMonth.has(ym)) return lookup.byMonth.get(ym)!;
  return lookup.byFileName.get(file.name.toLowerCase()) ?? null;
}

/**
 * Satellite flood extent arrives one file per month (129 of them for 2016 to 2026), so the import
 * screen checks them one after another, each as its own run, and can then promote every checked one.
 * One at a time on purpose: each file is read and measured in the API's memory, and the free server
 * has little of it. A file that is refused doesn't stop the rest; its reason is kept to show, and
 * failed or stopped files can be retried without re-uploading the ones that already passed.
 */
export function useSatelliteFloodBatch() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);
  const batchInputRef = useRef<BatchInput | null>(null);
  const itemsRef = useRef<BatchItem[]>([]);

  const setBatchItems = (next: BatchItem[] | ((current: BatchItem[]) => BatchItem[])) => {
    setItems((current) => {
      const updated = typeof next === "function" ? next(current) : next;
      itemsRef.current = updated;
      return updated;
    });
  };

  const update = (index: number, patch: Partial<BatchItem>) =>
    setBatchItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const checkFileAt = async (index: number, input: BatchInput): Promise<BatchItem> => {
    const file = input.files[index]!;
    update(index, { state: "checking", error: null });
    const singleYearMonth = input.files.length === 1 ? input.yearMonth : undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await startSatelliteFloodImport({
          file,
          countryCode: input.countryCode,
          sourceId: input.sourceId,
          yearMonth: singleYearMonth,
        });
        if (!response.data) throw new Error(response.message || "The server returned no import run.");
        const next: BatchItem = {
          fileName: file.name,
          yearMonth: response.data.options.yearMonth ?? monthFromFileName(file.name),
          state: "checked",
          run: response.data,
          error: null,
        };
        update(index, next);
        return next;
      } catch (error) {
        if (attempt === 0 && !stopRef.current && isTransientFailure(error)) {
          await pause(1500);
          continue;
        }
        const next: BatchItem = { fileName: file.name, state: "failed", run: null, error: errorMessage(error) };
        update(index, next);
        return next;
      }
    }
    const fallback: BatchItem = { fileName: file.name, state: "failed", run: null, error: "Request failed." };
    update(index, fallback);
    return fallback;
  };

  const checkAll = useCallback(async (input: BatchInput): Promise<BatchItem[]> => {
    batchInputRef.current = input;
    setRunning(true);
    stopRef.current = false;

    const existing =
      input.files.length > 1
        ? await fetchExistingSatelliteMonths(input.countryCode)
        : { byMonth: new Map<string, ExistingSatelliteMonth>(), byFileName: new Map<string, ExistingSatelliteMonth>() };

    const queued: BatchItem[] = input.files.map((file) => {
      const matched = input.files.length > 1 ? matchExistingFile(file, existing) : null;
      if (matched) {
        return {
          fileName: file.name,
          yearMonth: matched.yearMonth,
          state: matched.state,
          run: matched.run,
          error: null,
        };
      }
      return { fileName: file.name, state: "waiting", run: null, error: null };
    });

    setBatchItems(queued);
    const done = [...queued];
    try {
      for (let index = 0; index < input.files.length; index++) {
        if (stopRef.current) break;
        if (done[index]!.state !== "waiting") continue;
        done[index] = await checkFileAt(index, input);
      }
    } finally {
      setRunning(false);
    }
    return done;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Re-runs every file that failed (or was left waiting when stopped), keeping the ones already checked or promoted. */
  const retryFailed = useCallback(async (): Promise<BatchItem[]> => {
    const input = batchInputRef.current;
    if (!input) return itemsRef.current;
    const indices = itemsRef.current
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.state === "failed" || item.state === "waiting")
      .map(({ index }) => index);
    if (indices.length === 0) return itemsRef.current;

    for (const index of indices) update(index, { state: "waiting", error: null });
    setRunning(true);
    stopRef.current = false;
    try {
      for (const index of indices) {
        if (stopRef.current) break;
        await checkFileAt(index, input);
      }
    } finally {
      setRunning(false);
    }
    return itemsRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Retries a single failed or waiting file in the batch table. */
  const retryOne = useCallback(async (index: number): Promise<BatchItem | null> => {
    const input = batchInputRef.current;
    if (!input || !input.files[index]) return null;
    setRunning(true);
    stopRef.current = false;
    try {
      return await checkFileAt(index, input);
    } finally {
      setRunning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Promotes every checked run of the batch, oldest month first, so the latest ends up live last. */
  const promoteAll = useCallback(async () => {
    setRunning(true);
    stopRef.current = false;
    const order = itemsRef.current
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.state === "checked" && item.run)
      .sort((a, b) => (a.item.run!.options.yearMonth ?? "").localeCompare(b.item.run!.options.yearMonth ?? ""));
    try {
      for (const { item, index } of order) {
        if (stopRef.current) break;
        update(index, { state: "promoting", error: null });
        try {
          const response = await promoteImportRun(item.run!.id);
          update(index, { state: "promoted", run: response.data ?? item.run, error: null });
        } catch (error) {
          update(index, { state: "checked", error: errorMessage(error) });
        }
      }
    } finally {
      invalidateQueries(QUERY_KEYS.satelliteFlood);
      setRunning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Stops after the file in progress; what is done stays done. */
  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  const clear = useCallback(() => {
    batchInputRef.current = null;
    setBatchItems([]);
  }, []);

  return { items, running, checkAll, retryFailed, retryOne, promoteAll, stop, clear };
}

import { useCallback, useRef, useState } from "react";
import { QUERY_KEYS, invalidateQueries } from "../cache/queryClient";
import { promoteImportRun } from "../endpoints/import.endpoints";
import { startSatelliteFloodImport } from "../endpoints/satellite-flood.endpoints";
import { errorMessage } from "../transport/api-error";
import type { ImportRun } from "../types/import.types";

/** One file of a batch: waiting, being checked, checked (a run), promoted, or refused with a reason. */
export interface BatchItem {
  fileName: string;
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

/**
 * Satellite flood extent arrives one file per month (129 of them for 2016 to 2026), so the import
 * screen checks them one after another, each as its own run, and can then promote every checked one.
 * One at a time on purpose: each file is read and measured in the API's memory, and the free server
 * has little of it. A file that is refused doesn't stop the rest; its reason is kept to show.
 */
export function useSatelliteFloodBatch() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  const update = (index: number, patch: Partial<BatchItem>) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const checkAll = useCallback(async ({ files, countryCode, sourceId, yearMonth }: BatchInput): Promise<BatchItem[]> => {
    const queued: BatchItem[] = files.map((file) => ({ fileName: file.name, state: "waiting", run: null, error: null }));
    setItems(queued);
    setRunning(true);
    stopRef.current = false;
    const done = [...queued];
    try {
      for (const [index, file] of files.entries()) {
        if (stopRef.current) break;
        update(index, { state: "checking" });
        try {
          const response = await startSatelliteFloodImport({ file, countryCode, sourceId, yearMonth: files.length === 1 ? yearMonth : undefined });
          if (!response.data) throw new Error(response.message || "The server returned no import run.");
          done[index] = { ...done[index]!, state: "checked", run: response.data };
        } catch (error) {
          done[index] = { ...done[index]!, state: "failed", error: errorMessage(error) };
        }
        update(index, done[index]!);
      }
    } finally {
      setRunning(false);
    }
    return done;
  }, []);

  /** Promotes every checked run of the batch, oldest month first, so the latest ends up live last. */
  const promoteAll = useCallback(async () => {
    setRunning(true);
    stopRef.current = false;
    const order = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.state === "checked" && item.run)
      .sort((a, b) => (a.item.run!.options.yearMonth ?? "").localeCompare(b.item.run!.options.yearMonth ?? ""));
    try {
      for (const { item, index } of order) {
        if (stopRef.current) break;
        update(index, { state: "promoting" });
        try {
          const response = await promoteImportRun(item.run!.id);
          update(index, { state: "promoted", run: response.data ?? item.run });
        } catch (error) {
          update(index, { state: "checked", error: errorMessage(error) });
        }
      }
    } finally {
      invalidateQueries(QUERY_KEYS.satelliteFlood);
      setRunning(false);
    }
  }, [items]);

  /** Stops after the file in progress; what is done stays done. */
  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  const clear = useCallback(() => setItems([]), []);

  return { items, running, checkAll, promoteAll, stop, clear };
}

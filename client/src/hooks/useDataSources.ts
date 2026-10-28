import { useCallback } from "react";
import { createDataSource, deleteDataSource, fetchDataSources } from "../endpoints/data-source.endpoints";
import { errorMessage } from "../transport/api-error";
import type { DataSource, NewDataSourceInput } from "../types/data-source.types";
import { useLoader } from "./useLoader";

export interface RemoveSourcesResult {
  deleted: string[];
  /** Sources the server refused (usually 409: still in use), with the message to show. */
  failures: { id: string; message: string }[];
}

/**
 * The data sources an import can point at, plus "add a source" and "delete a source". Phase 2 keeps this to one page
 * of 100: the platform will have a handful of sources, not hundreds.
 */
export function useDataSources() {
  const { data, setData, ...state } = useLoader("data-sources", async () => {
    const response = await fetchDataSources({ page: 1, pageSize: 100 });
    return response.data ?? [];
  });

  /** Rejects with an ApiError (field errors for the form); on success the new source is listed first. */
  const addSource = useCallback(
    async (input: NewDataSourceInput): Promise<DataSource> => {
      const response = await createDataSource(input);
      if (!response.data) throw new Error(response.message || "The server returned no source.");
      const created = response.data;
      setData((current) => [created, ...(current ?? [])]);
      return created;
    },
    [setData],
  );

  /**
   * Deletes each source on its own, so one that is still in use (409) doesn't stop the rest.
   * Never rejects: the deleted ids leave the list, and each refusal comes back with its message.
   */
  const removeSources = useCallback(
    async (ids: string[]): Promise<RemoveSourcesResult> => {
      const outcomes = await Promise.allSettled(ids.map((id) => deleteDataSource(id)));
      const deleted: string[] = [];
      const failures: RemoveSourcesResult["failures"] = [];
      outcomes.forEach((outcome, index) => {
        const id = ids[index]!;
        if (outcome.status === "fulfilled") deleted.push(id);
        else failures.push({ id, message: errorMessage(outcome.reason) });
      });
      if (deleted.length > 0) setData((current) => (current ?? []).filter((source) => !deleted.includes(source.id)));
      return { deleted, failures };
    },
    [setData],
  );

  return { sources: data ?? ([] as DataSource[]), ...state, addSource, removeSources };
}

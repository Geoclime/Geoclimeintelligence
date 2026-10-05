import { useCallback } from "react";
import { createDataSource, fetchDataSources } from "../endpoints/data-source.endpoints";
import type { DataSource, NewDataSourceInput } from "../types/data-source.types";
import { useLoader } from "./useLoader";

/**
 * The data sources an import can point at, plus "add a source". Phase 2 keeps this to one page
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

  return { sources: data ?? ([] as DataSource[]), ...state, addSource };
}

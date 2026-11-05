import { useCallback, useState } from "react";
import { QUERY_KEYS, REFERENCE_POLICY, invalidateQueries } from "../cache/queryClient";
import { clearCountryLevel, createCountry, deleteCountry, fetchCountries, fetchCountry, updateCountry } from "../endpoints/country.endpoints";
import type { Country, CountryPatch, NewCountryInput } from "../types/country.types";
import { useLoader } from "./useLoader";

/** Every country with its levels and per-level area counts. Cached; dropped on any country write. */
export function useCountries() {
  const key = [...QUERY_KEYS.countries, "list"];
  const { data, ...state } = useLoader(key, async () => (await fetchCountries()).data ?? [], REFERENCE_POLICY);
  return { countries: data ?? ([] as Country[]), ...state };
}

/** One country by ISO code. `code` undefined = nothing to load. */
export function useCountry(code: string | undefined) {
  const key = code ? [...QUERY_KEYS.countries, "detail", code.toUpperCase()] : null;
  const { data, ...state } = useLoader<Country>(
    key,
    async () => {
      const response = await fetchCountry(code!);
      if (!response.data) throw new Error(response.message || "The server returned no country.");
      return response.data;
    },
    REFERENCE_POLICY,
  );
  return { country: data, ...state, notFound: state.errorStatus === 404 || state.errorStatus === 400 };
}

/**
 * Creates or updates a country. Rejects with an ApiError, so the form can put a 400's field
 * errors on the right inputs. Clears cached countries and areas, since level names show on both.
 */
export function useSaveCountry() {
  const save = useCallback(async (input: NewCountryInput | { code: string; patch: CountryPatch }): Promise<Country> => {
    const response = "code" in input ? await updateCountry(input.code, input.patch) : await createCountry(input);
    if (!response.data) throw new Error(response.message || "The server returned no country.");
    invalidateQueries(QUERY_KEYS.countries);
    invalidateQueries(QUERY_KEYS.adminUnits);
    return response.data;
  }, []);
  return { save };
}

/**
 * Deletes a country. The server only allows it while the country holds no areas, and rejects
 * otherwise with an ApiError (409) whose message says how many areas it holds.
 */
export function useDeleteCountry() {
  const [deleting, setDeleting] = useState(false);
  const remove = useCallback(async (code: string): Promise<void> => {
    setDeleting(true);
    try {
      await deleteCountry(code);
      invalidateQueries(QUERY_KEYS.countries);
    } finally {
      setDeleting(false);
    }
  }, []);
  return { remove, deleting };
}

/**
 * Clears one level of a country (deletes all its areas). The server refuses with an ApiError
 * (409) while the level below has areas or a user's region points into the level. Drops the
 * cached countries and areas, so lists and the map reload without the cleared areas.
 */
export function useClearLevel() {
  const [clearing, setClearing] = useState(false);
  const clear = useCallback(async (code: string, level: number): Promise<number> => {
    setClearing(true);
    try {
      const response = await clearCountryLevel(code, level);
      return response.data?.deleted ?? 0;
    } finally {
      invalidateQueries(QUERY_KEYS.countries);
      invalidateQueries(QUERY_KEYS.adminUnits);
      setClearing(false);
    }
  }, []);
  return { clear, clearing };
}

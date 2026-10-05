import { useCallback } from "react";
import { CACHE_KEYS, cached, invalidateCached } from "../cache/localCache";
import { createCountry, fetchCountries, fetchCountry, updateCountry } from "../endpoints/country.endpoints";
import type { Country, CountryPatch, NewCountryInput } from "../types/country.types";
import { useLoader } from "./useLoader";

/** Every country with its levels and per-level area counts. Cached; dropped on any country write. */
export function useCountries() {
  const key = `${CACHE_KEYS.countries}list`;
  const { data, ...state } = useLoader(key, () =>
    cached(key, async () => (await fetchCountries()).data ?? []),
  );
  return { countries: data ?? ([] as Country[]), ...state };
}

/** One country by ISO code. `code` undefined = nothing to load. */
export function useCountry(code: string | undefined) {
  const key = code ? `${CACHE_KEYS.countries}detail:${code.toUpperCase()}` : null;
  const { data, ...state } = useLoader<Country>(key, () =>
    cached(key!, async () => {
      const response = await fetchCountry(code!);
      if (!response.data) throw new Error(response.message || "The server returned no country.");
      return response.data;
    }),
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
    invalidateCached(CACHE_KEYS.countries);
    invalidateCached(CACHE_KEYS.adminUnits);
    return response.data;
  }, []);
  return { save };
}

import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type { Country, CountryPatch, NewCountryInput } from "../types/country.types";

// server/src/modules/admin-units/country.routes.ts. Reads: any signed-in user.
// Writes: Administrators only; anyone else gets a 403 whatever the UI shows.

export async function fetchCountries(): Promise<ApiResponse<Country[]>> {
  const { data } = await httpClient.get<ApiResponse<Country[]>>("/api/v1/countries");
  return data;
}

export async function fetchCountry(code: string): Promise<ApiResponse<Country>> {
  const { data } = await httpClient.get<ApiResponse<Country>>(`/api/v1/countries/${encodeURIComponent(code)}`);
  return data;
}

export async function createCountry(input: NewCountryInput): Promise<ApiResponse<Country>> {
  const { data } = await httpClient.post<ApiResponse<Country>>("/api/v1/countries", input);
  return data;
}

export async function updateCountry(code: string, patch: CountryPatch): Promise<ApiResponse<Country>> {
  const { data } = await httpClient.patch<ApiResponse<Country>>(`/api/v1/countries/${encodeURIComponent(code)}`, patch);
  return data;
}

/** Deletes a country that holds no areas. A country with any area is refused with a 409. */
export async function deleteCountry(code: string): Promise<ApiResponse<null>> {
  const { data } = await httpClient.delete<ApiResponse<null>>(`/api/v1/countries/${encodeURIComponent(code)}`);
  return data;
}

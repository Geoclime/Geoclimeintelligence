import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type { DrainInspection, DrainPeople, DrainageImportReport, FloodImpactFeatureCollection, FloodPeople } from "../types/field-survey.types";

// The rest of server/src/modules/field-survey/field-survey.routes.ts: who recorded, inspected or called
// something over (staff with survey.view_people), what a flood reaches as shapes, and importing a plan.

/** Who checked a drain and what they found, newest first. Staff only (survey.view_people). */
export async function fetchDrainInspections(id: string, limit = 20): Promise<ApiResponse<DrainInspection[]>> {
  const { data } = await httpClient.get<ApiResponse<DrainInspection[]>>(`/api/v1/drainage/${encodeURIComponent(id)}/inspections`, { params: { limit } });
  return data;
}

export async function fetchDrainPeople(id: string): Promise<ApiResponse<DrainPeople>> {
  const { data } = await httpClient.get<ApiResponse<DrainPeople>>(`/api/v1/drainage/${encodeURIComponent(id)}/people`);
  return data;
}

export async function fetchFloodPeople(id: string): Promise<ApiResponse<FloodPeople>> {
  const { data } = await httpClient.get<ApiResponse<FloodPeople>>(`/api/v1/flood-extents/${encodeURIComponent(id)}/people`);
  return data;
}

/** The buildings, roads and facilities inside a flood, as shapes to draw over it. */
export async function fetchFloodImpactFeatures(id: string): Promise<ApiResponse<FloodImpactFeatureCollection>> {
  const { data } = await httpClient.get<ApiResponse<FloodImpactFeatureCollection>>(`/api/v1/flood-extents/${encodeURIComponent(id)}/impact/features`);
  return data;
}

/** Loads a drainage plan (GeoJSON) for a country. Needs drainage.import. */
export async function importDrainagePlan(input: { file: File; countryCode: string; planDate: string; wardLevel?: number }): Promise<ApiResponse<DrainageImportReport>> {
  const form = new FormData();
  form.append("file", input.file, input.file.name);
  form.append("countryCode", input.countryCode);
  form.append("planDate", input.planDate);
  if (input.wardLevel) form.append("wardLevel", String(input.wardLevel));
  const { data } = await httpClient.post<ApiResponse<DrainageImportReport>>("/api/v1/drainage/import", form, { timeout: 180_000 });
  return data;
}

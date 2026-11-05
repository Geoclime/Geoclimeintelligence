import { useCallback } from "react";
import { fetchDrainInspections, fetchDrainPeople, fetchFloodImpactFeatures, fetchFloodPeople, importDrainagePlan } from "../endpoints/survey-detail.endpoints";
import type { DrainInspection, DrainPeople, FloodImpactFeatureCollection, FloodPeople } from "../types/field-survey.types";
import { useLoader } from "./useLoader";

// The details a flood's or drain's popup shows beyond the map layer. Never cached across screens: who
// last checked a drain is exactly what must be current. A null id (or not allowed) asks nothing.

/** Who recorded a drain and who last checked it. Staff only (survey.view_people). */
export function useDrainPeople(id: string, enabled: boolean) {
  const { data } = useLoader(enabled ? ["drain-people", id] : null, async () => (await fetchDrainPeople(id)).data ?? null);
  return data as DrainPeople | null | undefined;
}

/** A drain's inspections, newest first. Staff only (survey.view_people). */
export function useDrainInspections(id: string, enabled: boolean) {
  const { data, loading } = useLoader(enabled ? ["drain-inspections", id] : null, async () => (await fetchDrainInspections(id)).data ?? []);
  return { inspections: (data ?? null) as DrainInspection[] | null, loading };
}

/** Who recorded a flood and who called it over. Staff only (survey.view_people). */
export function useFloodPeople(id: string, enabled: boolean) {
  const { data } = useLoader(enabled ? ["flood-people", id] : null, async () => (await fetchFloodPeople(id)).data ?? null);
  return data as FloodPeople | null | undefined;
}

/** What a flood reaches, as shapes to draw over it. */
export function useFloodImpactFeatures(id: string | null) {
  const { data } = useLoader(id ? ["flood-impact-features", id] : null, async () => (await fetchFloodImpactFeatures(id!)).data ?? null);
  return (data ?? null) as FloodImpactFeatureCollection | null;
}

/** Loading a drainage plan. Rejects with an ApiError so the dialog can show why. */
export function useDrainageImport() {
  return useCallback((input: { file: File; countryCode: string; planDate: string }) => importDrainagePlan(input).then((response) => response.data ?? null), []);
}

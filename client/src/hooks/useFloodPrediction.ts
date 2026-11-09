import { useCallback, useState } from "react";
import { ALERTS_POLICY, invalidateQueries, LIVE_POLICY, QUERY_KEYS, SETTINGS_POLICY } from "../cache/queryClient";
import {
  draftAlertFromForecast,
  fetchAreaFloodOutlook,
  fetchFloodPredictions,
  fetchFloodPredictionSettings,
  fetchPublicFloodOutlook,
  generateAreaAiOutlook,
  refreshFloodPredictions,
  updateFloodPredictionSettings,
} from "../endpoints/flood-prediction.endpoints";
import type {
  AlertDraft,
  AreaFloodOutlook,
  FloodPredictionList,
  FloodPredictionSettings,
  PredictionHorizon,
  PublicFloodOutlook,
} from "../types/flood-prediction.types";
import { useLoader } from "./useLoader";

export function useFloodPredictions(countryCode: string | null = "NGA", horizon: PredictionHorizon = "7d", enabled = true) {
  const key = enabled && countryCode ? [...QUERY_KEYS.floodPrediction, "list", countryCode, horizon] : null;
  const { data, loading, error, refetch } = useLoader<FloodPredictionList>(
    key,
    async () => (await fetchFloodPredictions(countryCode!, horizon)).data!,
    LIVE_POLICY,
  );

  const refresh = useCallback(async () => {
    if (!countryCode) return null;
    const res = await refreshFloodPredictions(countryCode);
    invalidateQueries(QUERY_KEYS.floodPrediction);
    invalidateQueries(QUERY_KEYS.public);
    return res.data!;
  }, [countryCode]);

  return {
    predictions: data?.items ?? [],
    generatedAt: data?.generatedAt ?? null,
    loading,
    error,
    refetch,
    refresh,
  };
}

export function useAreaFloodOutlook(adminUnitId: string | undefined) {
  const key = adminUnitId ? [...QUERY_KEYS.floodPrediction, "area", adminUnitId] : null;
  const { data, loading, error, refetch, setData } = useLoader<AreaFloodOutlook>(
    key,
    async () => (await fetchAreaFloodOutlook(adminUnitId!)).data!,
    LIVE_POLICY,
  );
  const [generatingAi, setGeneratingAi] = useState(false);

  const generateAi = useCallback(
    async (horizon: PredictionHorizon = "7d") => {
      if (!adminUnitId) return null;
      setGeneratingAi(true);
      try {
        const res = await generateAreaAiOutlook(adminUnitId, horizon);
        const updated = res.data!;
        setData((current) => {
          if (!current) return current;
          return horizon === "7d" ? { ...current, sevenDay: updated } : { ...current, seasonal: updated };
        });
        invalidateQueries(QUERY_KEYS.floodPrediction, key ?? undefined);
        return updated;
      } finally {
        setGeneratingAi(false);
      }
    },
    [adminUnitId, key, setData],
  );

  return { outlook: data, loading, error, refetch, generateAi, generatingAi };
}

export function useFloodPredictionSettings() {
  const { data, loading, error, refetch, setData } = useLoader<FloodPredictionSettings>(
    [...QUERY_KEYS.floodPrediction, "settings"],
    async () => (await fetchFloodPredictionSettings()).data!,
    SETTINGS_POLICY,
  );

  const update = useCallback(
    async (patch: { showPublicFloodOutlook?: boolean; publicOutlookHorizon?: PredictionHorizon }) => {
      const res = await updateFloodPredictionSettings(patch);
      setData(() => res.data!);
      invalidateQueries(QUERY_KEYS.public);
      return res.data!;
    },
    [setData],
  );

  return { settings: data, loading, error, refetch, update };
}

export function usePublicFloodOutlook() {
  const { data, loading, error, refetch } = useLoader<PublicFloodOutlook>(
    [...QUERY_KEYS.public, "flood-outlook"],
    async () => (await fetchPublicFloodOutlook()).data!,
    ALERTS_POLICY,
  );
  return { outlook: data, loading, error, refetch };
}

export function useDraftAlertWithAi() {
  const [drafting, setDrafting] = useState(false);

  const draftAlert = useCallback(async (areaIds: string[]): Promise<AlertDraft> => {
    setDrafting(true);
    try {
      const res = await draftAlertFromForecast(areaIds);
      return res.data!;
    } finally {
      setDrafting(false);
    }
  }, []);

  return { draftAlert, drafting };
}

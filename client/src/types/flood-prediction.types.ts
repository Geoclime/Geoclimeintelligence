import type { AdminUnitRef } from "./admin-unit.types";
import type { AiProviderId } from "./ai.types";
import type { AlertSeverity } from "./alert.types";

/** Mirrors server/src/modules/flood-prediction/flood-prediction.types.ts. If one changes, both change. */
export const MIN_OUTLOOK_DAYS = 1;
export const MAX_OUTLOOK_DAYS = 30;
/** The window the map layer, the Alerts page and alert drafts use. */
export const DEFAULT_OUTLOOK_DAYS = 7;
/** How far ahead the weather provider forecasts. Later days in a longer outlook are not forecast. */
export const LIVE_FORECAST_DAYS = 16;
/** Quick choices beside the day-count box. */
export const OUTLOOK_DAY_PRESETS = [3, 7, 14, 30] as const;

/** "1 day", "7 days". */
export const daysLabel = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

export const PREDICTION_RISK_LEVELS = ["normal", "watch", "warning", "severe"] as const;
export type PredictionRiskLevel = (typeof PREDICTION_RISK_LEVELS)[number];

export interface DailyForecastItem {
  date: string;
  rainfallMm: number;
  probabilityPercent: number | null;
  riverDischargeM3s: number | null;
}

export interface PredictionDrivers {
  forecastRainScore: number;
  riverDischargeScore: number;
  susceptibilityScore: number;
  drainageVulnerabilityScore: number;
  groundSaturationScore: number;
  factors: string[];
  metrics: {
    percentHighOrVeryHighRisk: number | null;
    blockedDrainsCount: number;
    totalDrainsCount: number;
    activeFloodsCount: number;
    historicalMonthAverageMm: number | null;
  };
}

export interface FloodPrediction {
  id: string;
  adminUnit: AdminUnitRef;
  parentId: string | null;
  /** How many days ahead this outlook looks. */
  horizonDays: number;
  validFrom: string;
  validTo: string;
  riskLevel: PredictionRiskLevel;
  likelihoodScore: number;
  forecastRainfallMm: number;
  peakDailyRainfallMm: number;
  peakDayDate: string | null;
  riverDischargeM3s: number | null;
  riverDischargeRatio: number | null;
  dailyForecast: DailyForecastItem[];
  drivers: PredictionDrivers;
  aiSummary: string | null;
  aiPreparedness: string[];
  aiCaveats: string | null;
  aiProvider: AiProviderId | null;
  aiModel: string | null;
  dataType: "MODELLED";
  weatherProvider: string;
  updatedAt: string;
}

export interface FloodPredictionList {
  countryCode: string;
  horizonDays: number;
  generatedAt: string | null;
  items: FloodPrediction[];
}

export interface AreaFloodOutlook {
  adminUnit: AdminUnitRef;
  horizonDays: number;
  outlook: FloodPrediction;
}

export interface FloodPredictionSettings {
  showPublicFloodOutlook: boolean;
  /** How many days ahead the outlook on the public home page looks. */
  publicOutlookDays: number;
  updatedAt: string;
}

export interface PublicFloodOutlookItem {
  adminUnit: AdminUnitRef;
  riskLevel: PredictionRiskLevel;
  likelihoodScore: number;
  forecastRainfallMm: number;
  peakDailyRainfallMm: number;
  peakDayDate: string | null;
  topFactors: string[];
  aiSummary: string | null;
  dataType: "MODELLED";
}

export interface PublicFloodOutlook {
  enabled: boolean;
  horizonDays: number;
  generatedAt: string | null;
  weatherProvider: string;
  items: PublicFloodOutlookItem[];
}

export interface AlertDraft {
  severity: AlertSeverity;
  title: string;
  message: string;
  actions: string[];
  suggestedDurationHours: number;
  caveats: string;
  provider: AiProviderId;
  model: string;
}

export const PREDICTION_RISK_INFO: Record<
  PredictionRiskLevel,
  { label: string; color: string; badgeTone: "neutral" | "warning" | "danger"; description: string }
> = {
  normal: {
    label: "Normal",
    color: "#16b364",
    badgeTone: "neutral",
    description: "No unusual flooding expected from current forecast.",
  },
  watch: {
    label: "Flood watch",
    color: "#f59e0b",
    badgeTone: "warning",
    description: "Flooding possible in low-lying areas or near blocked drains.",
  },
  warning: {
    label: "Flood warning",
    color: "#f97316",
    badgeTone: "warning",
    description: "Flooding likely; prepare drains and vulnerable households.",
  },
  severe: {
    label: "Severe flood risk",
    color: "#dc2626",
    badgeTone: "danger",
    description: "Severe flooding expected; high danger to life and property.",
  },
};

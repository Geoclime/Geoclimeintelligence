import type { AdminUnitRef } from "./admin-unit.types";
import type { AiProviderId } from "./ai.types";
import type { AlertSeverity } from "./alert.types";

export const PREDICTION_HORIZONS = ["7d", "seasonal"] as const;
export type PredictionHorizon = (typeof PREDICTION_HORIZONS)[number];

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
  horizon: PredictionHorizon;
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
  horizon: PredictionHorizon;
  generatedAt: string | null;
  items: FloodPrediction[];
}

export interface AreaFloodOutlook {
  adminUnit: AdminUnitRef;
  sevenDay: FloodPrediction;
  seasonal: FloodPrediction;
}

export interface FloodPredictionSettings {
  showPublicFloodOutlook: boolean;
  publicOutlookHorizon: PredictionHorizon;
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
  horizon: PredictionHorizon;
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

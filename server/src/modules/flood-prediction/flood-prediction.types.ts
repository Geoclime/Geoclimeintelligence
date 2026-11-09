import type { AdminUnitRef } from "../admin-units/admin-unit.types";
import type { AiProviderId } from "../ai/providers/ai-provider";
import type { AlertSeverity } from "../alerts/alert.types";

export const PREDICTION_HORIZONS = ["7d", "seasonal"] as const;
export type PredictionHorizon = (typeof PREDICTION_HORIZONS)[number];

export const PREDICTION_RISK_LEVELS = ["normal", "watch", "warning", "severe"] as const;
export type PredictionRiskLevel = (typeof PREDICTION_RISK_LEVELS)[number];

export interface DailyForecastItem {
  date: string; // YYYY-MM-DD
  rainfallMm: number;
  probabilityPercent: number | null;
  riverDischargeM3s: number | null;
}

export interface PredictionDrivers {
  /** 0-100 sub-score from peak daily and cumulative forecast rain */
  forecastRainScore: number;
  /** 0-100 sub-score from GloFAS river discharge vs baseline */
  riverDischargeScore: number;
  /** 0-100 sub-score from FloodRiskService % high or very high */
  susceptibilityScore: number;
  /** 0-100 sub-score from blocked/damaged drains */
  drainageVulnerabilityScore: number;
  /** 0-100 sub-score from ground saturation, active floods and seasonal baseline */
  groundSaturationScore: number;
  /** Human-readable factors that contributed most */
  factors: string[];
  /** Raw metrics used so the UI and AI prompt can inspect them */
  metrics: {
    percentHighOrVeryHighRisk: number | null;
    blockedDrainsCount: number;
    totalDrainsCount: number;
    activeFloodsCount: number;
    historicalMonthAverageMm: number | null;
  };
}

export interface FloodPredictionDto {
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

export interface FloodPredictionListDto {
  countryCode: string;
  horizon: PredictionHorizon;
  generatedAt: string | null;
  items: FloodPredictionDto[];
}

export interface AreaFloodOutlookDto {
  adminUnit: AdminUnitRef;
  sevenDay: FloodPredictionDto;
  seasonal: FloodPredictionDto;
}

export interface FloodPredictionSettingsDto {
  showPublicFloodOutlook: boolean;
  publicOutlookHorizon: PredictionHorizon;
  updatedAt: string;
}

export interface PublicFloodOutlookDto {
  enabled: boolean;
  horizon: PredictionHorizon;
  generatedAt: string | null;
  weatherProvider: string;
  items: {
    adminUnit: AdminUnitRef;
    riskLevel: PredictionRiskLevel;
    likelihoodScore: number;
    forecastRainfallMm: number;
    peakDailyRainfallMm: number;
    peakDayDate: string | null;
    topFactors: string[];
    aiSummary: string | null;
    dataType: "MODELLED";
  }[];
}

export interface AlertDraftDto {
  severity: AlertSeverity;
  title: string;
  message: string;
  actions: string[];
  suggestedDurationHours: number;
  caveats: string;
  provider: AiProviderId;
  model: string;
}

export interface ForecastSnapshot {
  weatherProvider: string;
  days: DailyForecastItem[];
  peakDischargeM3s: number | null;
  meanDischargeM3s: number | null;
}

export interface IForecastFetcher {
  fetch7Day(lon: number, lat: number, now?: Date): Promise<ForecastSnapshot>;
}

export interface NewFloodPredictionRow {
  adminUnitId: string;
  countryCode: string;
  horizon: PredictionHorizon;
  validFrom: Date;
  validTo: Date;
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
  weatherProvider: string;
}

export interface IFloodPredictionRepository {
  findByCountry(countryCode: string, horizon: PredictionHorizon): Promise<FloodPredictionDto[]>;
  findByUnit(adminUnitId: string, horizon: PredictionHorizon): Promise<FloodPredictionDto | null>;
  upsert(input: NewFloodPredictionRow): Promise<FloodPredictionDto>;
  getSettings(): Promise<FloodPredictionSettingsDto>;
  updateSettings(patch: {
    showPublicFloodOutlook?: boolean;
    publicOutlookHorizon?: PredictionHorizon;
    updatedBy: string;
  }): Promise<FloodPredictionSettingsDto>;
}

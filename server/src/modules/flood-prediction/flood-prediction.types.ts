import type { AdminUnitRef } from "../admin-units/admin-unit.types";
import type { AiProviderId } from "../ai/providers/ai-provider";
import type { AlertSeverity } from "../alerts/alert.types";

/** An outlook looks this many days ahead: any whole number from the smallest to the largest. */
export const MIN_OUTLOOK_DAYS = 1;
export const MAX_OUTLOOK_DAYS = 30;
/** The window the map layer, the Alerts page and alert drafts use. */
export const DEFAULT_OUTLOOK_DAYS = 7;
/**
 * How far ahead the weather provider forecasts. In an outlook longer than this, the days after it are
 * not forecast: they use the 10-year average rainfall for the month, and the outlook says so.
 */
export const LIVE_FORECAST_DAYS = 16;

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

export interface FloodPredictionListDto {
  countryCode: string;
  horizonDays: number;
  generatedAt: string | null;
  items: FloodPredictionDto[];
}

export interface AreaFloodOutlookDto {
  adminUnit: AdminUnitRef;
  horizonDays: number;
  outlook: FloodPredictionDto;
}

export interface FloodPredictionSettingsDto {
  showPublicFloodOutlook: boolean;
  /** How many days ahead the outlook on the public home page looks. */
  publicOutlookDays: number;
  updatedAt: string;
}

export interface PublicFloodOutlookDto {
  enabled: boolean;
  horizonDays: number;
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
  /** Up to LIVE_FORECAST_DAYS days, starting today. */
  days: DailyForecastItem[];
  peakDischargeM3s: number | null;
  meanDischargeM3s: number | null;
}

export interface IForecastFetcher {
  fetchForecast(lon: number, lat: number, now?: Date): Promise<ForecastSnapshot>;
}

export interface NewFloodPredictionRow {
  adminUnitId: string;
  countryCode: string;
  horizonDays: number;
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
  findByCountry(countryCode: string, horizonDays: number): Promise<FloodPredictionDto[]>;
  findByUnit(adminUnitId: string, horizonDays: number): Promise<FloodPredictionDto | null>;
  /** Every day-count that has been computed for this country, so a refresh keeps each of them current. */
  horizonsInUse(countryCode: string): Promise<number[]>;
  upsert(input: NewFloodPredictionRow): Promise<FloodPredictionDto>;
  getSettings(): Promise<FloodPredictionSettingsDto>;
  updateSettings(patch: {
    showPublicFloodOutlook?: boolean;
    publicOutlookDays?: number;
    updatedBy: string;
  }): Promise<FloodPredictionSettingsDto>;
}

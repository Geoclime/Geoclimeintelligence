import { AppDataSource } from "../../config/data-source";
import type { AiProviderId } from "../ai/providers/ai-provider";
import type {
  DailyForecastItem,
  FloodPredictionDto,
  FloodPredictionSettingsDto,
  IFloodPredictionRepository,
  NewFloodPredictionRow,
  PredictionDrivers,
  PredictionHorizon,
  PredictionRiskLevel,
} from "./flood-prediction.types";

interface RawPredictionRow {
  id: string;
  admin_unit_id: string;
  country_code: string;
  unit_name: string;
  unit_code: string | null;
  level: number;
  level_name: string;
  parent_id: string | null;
  horizon: PredictionHorizon;
  valid_from: Date | string;
  valid_to: Date | string;
  risk_level: PredictionRiskLevel;
  likelihood_score: number;
  forecast_rainfall_mm: string | number;
  peak_daily_rainfall_mm: string | number;
  peak_day_date: string | null;
  river_discharge_m3s: string | number | null;
  river_discharge_ratio: string | number | null;
  daily_forecast: DailyForecastItem[] | null;
  drivers: PredictionDrivers | null;
  ai_summary: string | null;
  ai_preparedness: string[] | null;
  ai_caveats: string | null;
  ai_provider: AiProviderId | null;
  ai_model: string | null;
  weather_provider: string;
  updated_at: Date | string;
}

const DEFAULT_DRIVERS: PredictionDrivers = {
  forecastRainScore: 0,
  riverDischargeScore: 0,
  susceptibilityScore: 0,
  drainageVulnerabilityScore: 0,
  groundSaturationScore: 0,
  factors: [],
  metrics: {
    percentHighOrVeryHighRisk: null,
    blockedDrainsCount: 0,
    totalDrainsCount: 0,
    activeFloodsCount: 0,
    historicalMonthAverageMm: null,
  },
};

function toDto(row: RawPredictionRow): FloodPredictionDto {
  const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());
  return {
    id: row.id,
    adminUnit: {
      id: row.admin_unit_id,
      countryCode: row.country_code,
      level: Number(row.level),
      levelName: row.level_name,
      unitName: row.unit_name,
      unitCode: row.unit_code,
    },
    parentId: row.parent_id,
    horizon: row.horizon,
    validFrom: iso(row.valid_from),
    validTo: iso(row.valid_to),
    riskLevel: row.risk_level,
    likelihoodScore: Number(row.likelihood_score),
    forecastRainfallMm: Number(row.forecast_rainfall_mm),
    peakDailyRainfallMm: Number(row.peak_daily_rainfall_mm),
    peakDayDate: row.peak_day_date,
    riverDischargeM3s: row.river_discharge_m3s !== null ? Number(row.river_discharge_m3s) : null,
    riverDischargeRatio: row.river_discharge_ratio !== null ? Number(row.river_discharge_ratio) : null,
    dailyForecast: Array.isArray(row.daily_forecast) ? row.daily_forecast : [],
    drivers: row.drivers ?? DEFAULT_DRIVERS,
    aiSummary: row.ai_summary,
    aiPreparedness: Array.isArray(row.ai_preparedness) ? row.ai_preparedness : [],
    aiCaveats: row.ai_caveats,
    aiProvider: row.ai_provider,
    aiModel: row.ai_model,
    dataType: "MODELLED",
    weatherProvider: row.weather_provider,
    updatedAt: iso(row.updated_at),
  };
}

const SELECT_PREDICTION = `
  SELECT fp.*,
         au.unit_name,
         au.unit_code,
         au.level,
         au.level_name,
         au.parent_id
    FROM flood_predictions fp
    JOIN admin_units au ON au.id = fp.admin_unit_id
`;

export class FloodPredictionRepository implements IFloodPredictionRepository {
  private static _instance?: FloodPredictionRepository;
  static get Instance(): FloodPredictionRepository {
    return (this._instance ??= new FloodPredictionRepository());
  }

  async findByCountry(countryCode: string, horizon: PredictionHorizon): Promise<FloodPredictionDto[]> {
    const rows: RawPredictionRow[] = await AppDataSource.query(
      `${SELECT_PREDICTION}
        WHERE fp.country_code = $1 AND fp.horizon = $2 AND au.level = 2
        ORDER BY fp.likelihood_score DESC, au.unit_name ASC`,
      [countryCode, horizon],
    );
    return rows.map(toDto);
  }

  async findByUnit(adminUnitId: string, horizon: PredictionHorizon): Promise<FloodPredictionDto | null> {
    const rows: RawPredictionRow[] = await AppDataSource.query(
      `${SELECT_PREDICTION}
        WHERE fp.admin_unit_id = $1 AND fp.horizon = $2
        LIMIT 1`,
      [adminUnitId, horizon],
    );
    return rows[0] ? toDto(rows[0]) : null;
  }

  async upsert(input: NewFloodPredictionRow): Promise<FloodPredictionDto> {
    await AppDataSource.query(
      `INSERT INTO flood_predictions (
         admin_unit_id, country_code, horizon, valid_from, valid_to,
         risk_level, likelihood_score, forecast_rainfall_mm, peak_daily_rainfall_mm,
         peak_day_date, river_discharge_m3s, river_discharge_ratio,
         daily_forecast, drivers, ai_summary, ai_preparedness, ai_caveats,
         ai_provider, ai_model, data_type, weather_provider, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9,
         $10, $11, $12,
         $13::jsonb, $14::jsonb, $15, $16::jsonb, $17,
         $18, $19, 'MODELLED', $20, now()
       )
       ON CONFLICT (admin_unit_id, horizon) DO UPDATE SET
         valid_from = EXCLUDED.valid_from,
         valid_to = EXCLUDED.valid_to,
         risk_level = EXCLUDED.risk_level,
         likelihood_score = EXCLUDED.likelihood_score,
         forecast_rainfall_mm = EXCLUDED.forecast_rainfall_mm,
         peak_daily_rainfall_mm = EXCLUDED.peak_daily_rainfall_mm,
         peak_day_date = EXCLUDED.peak_day_date,
         river_discharge_m3s = EXCLUDED.river_discharge_m3s,
         river_discharge_ratio = EXCLUDED.river_discharge_ratio,
         daily_forecast = EXCLUDED.daily_forecast,
         drivers = EXCLUDED.drivers,
         ai_summary = COALESCE(EXCLUDED.ai_summary, flood_predictions.ai_summary),
         ai_preparedness = CASE WHEN EXCLUDED.ai_summary IS NOT NULL THEN EXCLUDED.ai_preparedness ELSE flood_predictions.ai_preparedness END,
         ai_caveats = COALESCE(EXCLUDED.ai_caveats, flood_predictions.ai_caveats),
         ai_provider = COALESCE(EXCLUDED.ai_provider, flood_predictions.ai_provider),
         ai_model = COALESCE(EXCLUDED.ai_model, flood_predictions.ai_model),
         weather_provider = EXCLUDED.weather_provider,
         updated_at = now()`,
      [
        input.adminUnitId,
        input.countryCode,
        input.horizon,
        input.validFrom,
        input.validTo,
        input.riskLevel,
        input.likelihoodScore,
        input.forecastRainfallMm,
        input.peakDailyRainfallMm,
        input.peakDayDate,
        input.riverDischargeM3s,
        input.riverDischargeRatio,
        JSON.stringify(input.dailyForecast),
        JSON.stringify(input.drivers),
        input.aiSummary,
        JSON.stringify(input.aiPreparedness),
        input.aiCaveats,
        input.aiProvider,
        input.aiModel,
        input.weatherProvider,
      ],
    );

    const saved = await this.findByUnit(input.adminUnitId, input.horizon);
    return saved!;
  }

  async getSettings(): Promise<FloodPredictionSettingsDto> {
    const rows: {
      show_public_flood_outlook: boolean;
      public_outlook_horizon: PredictionHorizon;
      updated_at: Date | string;
    }[] = await AppDataSource.query(
      `SELECT show_public_flood_outlook, public_outlook_horizon, updated_at FROM platform_settings WHERE id = 1`,
    );
    const row = rows[0];
    if (!row) {
      return {
        showPublicFloodOutlook: false,
        publicOutlookHorizon: "7d",
        updatedAt: new Date(0).toISOString(),
      };
    }
    return {
      showPublicFloodOutlook: Boolean(row.show_public_flood_outlook),
      publicOutlookHorizon: row.public_outlook_horizon,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
    };
  }

  async updateSettings(patch: {
    showPublicFloodOutlook?: boolean;
    publicOutlookHorizon?: PredictionHorizon;
    updatedBy: string;
  }): Promise<FloodPredictionSettingsDto> {
    const current = await this.getSettings();
    const show = patch.showPublicFloodOutlook ?? current.showPublicFloodOutlook;
    const horizon = patch.publicOutlookHorizon ?? current.publicOutlookHorizon;
    await AppDataSource.query(
      `INSERT INTO platform_settings (id, show_public_flood_outlook, public_outlook_horizon, updated_by, updated_at)
       VALUES (1, $1, $2, $3, now())
       ON CONFLICT (id) DO UPDATE SET
         show_public_flood_outlook = EXCLUDED.show_public_flood_outlook,
         public_outlook_horizon = EXCLUDED.public_outlook_horizon,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()`,
      [show, horizon, patch.updatedBy],
    );
    return this.getSettings();
  }
}

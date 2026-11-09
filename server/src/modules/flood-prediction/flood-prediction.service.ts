import type { AuthUser } from "../../common/access/auth-user";
import { RegionAccess } from "../../common/access/region-access";
import { NotFoundError, ValidationError } from "../../common/errors/app-error";
import { domainEvents } from "../../common/events/domain-events";
import { AdminUnitRepository } from "../admin-units/admin-unit.repository";
import { toRef, type AdminUnitSummary, type IAdminUnitRepository } from "../admin-units/admin-unit.types";
import { AiService } from "../ai/ai.service";
import { AuditService } from "../audit/audit.service";
import { DrainageService } from "../field-survey/drainage.service";
import { FloodExtentService } from "../field-survey/flood-extent.service";
import { FloodRiskService } from "../flood-risk/flood-risk.service";
import { RainfallService } from "../rainfall/rainfall.service";
import {
  ALERT_DRAFT_JSON_SCHEMA,
  ALERT_DRAFT_SYSTEM_PROMPT,
  alertDraftSchema,
  buildAlertDraftPrompt,
  buildFloodOutlookPrompt,
  FLOOD_OUTLOOK_JSON_SCHEMA,
  FLOOD_OUTLOOK_SYSTEM_PROMPT,
  floodOutlookDraftSchema,
  postProcessAlertDraft,
  postProcessOutlookDraft,
  type FloodOutlookPromptInput,
} from "./flood-prediction.domain";
import { FloodPredictionRepository } from "./flood-prediction.repository";
import type {
  AlertDraftDto,
  AreaFloodOutlookDto,
  FloodPredictionDto,
  FloodPredictionListDto,
  FloodPredictionSettingsDto,
  IFloodPredictionRepository,
  IForecastFetcher,
  PredictionHorizon,
  PublicFloodOutlookDto,
} from "./flood-prediction.types";
import { OpenMeteoForecastFetcher } from "./forecast-fetcher";
import { computeFloodPrediction } from "./prediction-scorer";

export interface FloodPredictionDeps {
  predictions: IFloodPredictionRepository;
  units: Pick<IAdminUnitRepository, "findSummaries" | "findSummaryById">;
  fetcher: IForecastFetcher;
  floodRisk: Pick<FloodRiskService, "area">;
  drainage: Pick<DrainageService, "summary">;
  floodExtents: Pick<FloodExtentService, "history">;
  rainfall: Pick<RainfallService, "series">;
  ai: Pick<AiService, "generateJson" | "status">;
  regions: Pick<RegionAccess, "assert">;
  audit: Pick<AuditService, "record">;
  now?: () => Date;
}

export class FloodPredictionService {
  private static _instance?: FloodPredictionService;
  static get Instance(): FloodPredictionService {
    return (this._instance ??= new FloodPredictionService({
      predictions: FloodPredictionRepository.Instance,
      units: AdminUnitRepository.Instance,
      fetcher: OpenMeteoForecastFetcher.Instance,
      floodRisk: FloodRiskService.Instance,
      drainage: DrainageService.Instance,
      floodExtents: FloodExtentService.Instance,
      rainfall: RainfallService.Instance,
      ai: AiService.Instance,
      regions: RegionAccess.Instance,
      audit: AuditService.Instance,
    }));
  }

  private readonly now: () => Date;

  constructor(private readonly deps: FloodPredictionDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Lists predictions for all LGAs in a country for the chosen horizon.
   * If none have been computed yet, computes them on the fly so the map layer and Alerts page
   * always have fresh predictions ready.
   */
  async list(countryCode: string, horizon: PredictionHorizon = "7d"): Promise<FloodPredictionListDto> {
    let items = await this.deps.predictions.findByCountry(countryCode, horizon);
    if (items.length === 0) {
      await this.refreshCountry(countryCode);
      items = await this.deps.predictions.findByCountry(countryCode, horizon);
    }
    const generatedAt = items.length > 0 ? items[0]!.updatedAt : null;
    return { countryCode, horizon, generatedAt, items };
  }

  /**
   * Detailed 7-day and seasonal outlook for one LGA or Ward.
   * Computes and stores the prediction on first read if not yet present.
   */
  async area(adminUnitId: string): Promise<AreaFloodOutlookDto> {
    const unit = await this.deps.units.findSummaryById(adminUnitId);
    if (!unit) throw new NotFoundError("Admin unit");

    let [sevenDay, seasonal] = await Promise.all([
      this.deps.predictions.findByUnit(adminUnitId, "7d"),
      this.deps.predictions.findByUnit(adminUnitId, "seasonal"),
    ]);

    if (!sevenDay || !seasonal) {
      const computed = await this.computeAndStoreForUnit(unit);
      sevenDay = computed.sevenDay;
      seasonal = computed.seasonal;
    }

    return {
      adminUnit: toRef(unit),
      sevenDay,
      seasonal,
    };
  }

  /**
   * Refreshes both 7d and seasonal predictions for all LGAs in a country.
   */
  async refreshCountry(countryCode: string, actor?: AuthUser): Promise<FloodPredictionListDto> {
    const { items: lgas } = await this.deps.units.findSummaries({
      countryCode,
      level: 2,
      page: 1,
      pageSize: 100,
    });

    for (const lga of lgas) {
      await this.computeAndStoreForUnit(lga);
    }

    if (actor) {
      await this.deps.audit.record(actor, {
        action: "flood_prediction.refreshed",
        entityType: "flood_prediction",
        entityId: null,
        summary: `Refreshed 7-day and seasonal flood predictions for ${lgas.length} LGAs in ${countryCode}`,
        details: { countryCode, lgaCount: lgas.length },
      });
    }

    domainEvents.emit("prediction.updated", { countryCode });
    return this.list(countryCode, "7d");
  }

  /**
   * Runs `AiService.generateJson` (`flood_outlook_draft`) to synthesize a plain-English narrative
   * and preparedness checklist for a specific LGA or Ward.
   */
  async generateAiOutlook(
    adminUnitId: string,
    horizon: PredictionHorizon,
    actor: AuthUser,
  ): Promise<FloodPredictionDto> {
    const unit = await this.deps.units.findSummaryById(adminUnitId);
    if (!unit) throw new NotFoundError("Admin unit");

    const { sevenDay, seasonal } = await this.computeAndStoreForUnit(unit);
    const target = horizon === "seasonal" ? seasonal : sevenDay;
    const promptInput = await this.buildPromptInputFor(unit, target);

    const aiResult = await this.deps.ai.generateJson(actor, {
      feature: "flood_outlook_draft",
      system: FLOOD_OUTLOOK_SYSTEM_PROMPT,
      prompt: buildFloodOutlookPrompt(promptInput),
      schema: floodOutlookDraftSchema,
      schemaName: "flood_outlook_draft",
      jsonSchema: FLOOD_OUTLOOK_JSON_SCHEMA,
      maxOutputTokens: 2048,
    });

    const processed = postProcessOutlookDraft(aiResult.data);
    const updated = await this.deps.predictions.upsert({
      adminUnitId: unit.id,
      countryCode: unit.countryCode,
      horizon: target.horizon,
      validFrom: new Date(target.validFrom),
      validTo: new Date(target.validTo),
      riskLevel: target.riskLevel,
      likelihoodScore: target.likelihoodScore,
      forecastRainfallMm: target.forecastRainfallMm,
      peakDailyRainfallMm: target.peakDailyRainfallMm,
      peakDayDate: target.peakDayDate,
      riverDischargeM3s: target.riverDischargeM3s,
      riverDischargeRatio: target.riverDischargeRatio,
      dailyForecast: target.dailyForecast,
      drivers: target.drivers,
      aiSummary: processed.summary,
      aiPreparedness: processed.preparedness,
      aiCaveats: processed.caveats,
      aiProvider: aiResult.provider,
      aiModel: aiResult.model,
      weatherProvider: target.weatherProvider,
    });

    domainEvents.emit("prediction.updated", { countryCode: unit.countryCode });
    return updated;
  }

  /**
   * Drafts a flood alert (`alert_draft`) to pre-fill `AlertFormDialog` for one or more LGAs.
   * Nothing is saved or issued until the human official submits `AlertFormDialog`.
   */
  async draftAlert(areaIds: string[], actor: AuthUser): Promise<AlertDraftDto> {
    const uniqueIds = [...new Set(areaIds)];
    if (uniqueIds.length === 0) {
      throw new ValidationError([{ field: "areaIds", message: "Choose at least one area to draft an alert for" }]);
    }

    const promptInputs: FloodOutlookPromptInput[] = [];
    for (const id of uniqueIds) {
      const unit = await this.deps.units.findSummaryById(id);
      if (!unit) throw new ValidationError([{ field: "areaIds", message: `No area with id ${id} exists` }]);
      await this.deps.regions.assert(actor, id);

      let prediction = await this.deps.predictions.findByUnit(id, "7d");
      if (!prediction) {
        prediction = (await this.computeAndStoreForUnit(unit)).sevenDay;
      }
      promptInputs.push(await this.buildPromptInputFor(unit, prediction));
    }

    const aiResult = await this.deps.ai.generateJson(actor, {
      feature: "alert_draft",
      system: ALERT_DRAFT_SYSTEM_PROMPT,
      prompt: buildAlertDraftPrompt(promptInputs),
      schema: alertDraftSchema,
      schemaName: "alert_draft",
      jsonSchema: ALERT_DRAFT_JSON_SCHEMA,
      maxOutputTokens: 2048,
    });

    const processed = postProcessAlertDraft(aiResult.data);
    return {
      ...processed,
      provider: aiResult.provider,
      model: aiResult.model,
    };
  }

  async getSettings(): Promise<FloodPredictionSettingsDto> {
    return this.deps.predictions.getSettings();
  }

  async updateSettings(
    patch: { showPublicFloodOutlook?: boolean; publicOutlookHorizon?: PredictionHorizon },
    actor: AuthUser,
  ): Promise<FloodPredictionSettingsDto> {
    const updated = await this.deps.predictions.updateSettings({
      ...patch,
      updatedBy: actor.id,
    });
    await this.deps.audit.record(actor, {
      action: "flood_prediction.settings_updated",
      entityType: "platform_settings",
      entityId: null,
      summary: `${updated.showPublicFloodOutlook ? "Enabled" : "Hid"} public flood outlook on the landing page (${updated.publicOutlookHorizon})`,
      details: {
        showPublicFloodOutlook: updated.showPublicFloodOutlook,
        publicOutlookHorizon: updated.publicOutlookHorizon,
      },
    });
    domainEvents.emit("prediction.updated", { countryCode: "NGA" });
    return updated;
  }

  /**
   * Public landing page outlook. Returns `{ enabled: false, items: [] }` unless an administrator
   * has explicitly enabled `showPublicFloodOutlook`.
   */
  async publicOutlook(countryCode = "NGA"): Promise<PublicFloodOutlookDto> {
    const settings = await this.deps.predictions.getSettings();
    if (!settings.showPublicFloodOutlook) {
      return {
        enabled: false,
        horizon: settings.publicOutlookHorizon,
        generatedAt: null,
        weatherProvider: "Open-Meteo & GloFAS",
        items: [],
      };
    }

    const list = await this.list(countryCode, settings.publicOutlookHorizon);
    return {
      enabled: true,
      horizon: settings.publicOutlookHorizon,
      generatedAt: list.generatedAt,
      weatherProvider: list.items[0]?.weatherProvider ?? "Open-Meteo & GloFAS",
      items: list.items.map((item) => ({
        adminUnit: item.adminUnit,
        riskLevel: item.riskLevel,
        likelihoodScore: item.likelihoodScore,
        forecastRainfallMm: item.forecastRainfallMm,
        peakDailyRainfallMm: item.peakDailyRainfallMm,
        peakDayDate: item.peakDayDate,
        topFactors: item.drivers.factors.slice(0, 3),
        aiSummary: item.aiSummary,
        dataType: "MODELLED",
      })),
    };
  }

  private async computeAndStoreForUnit(
    unit: AdminUnitSummary,
  ): Promise<{ sevenDay: FloodPredictionDto; seasonal: FloodPredictionDto }> {
    const now = this.now();
    const [lon, lat] = unit.centroid;
    const rainfallUnitId = unit.level === 3 && unit.parentId ? unit.parentId : unit.id;

    const [forecast, riskArea, drainageSummary, floodHistory, rainfallSeries] = await Promise.all([
      this.deps.fetcher.fetch7Day(lon, lat, now),
      this.deps.floodRisk.area(unit.id).catch(() => null),
      this.deps.drainage.summary(unit.id, 10).catch(() => ({
        total: 0,
        needAttention: 0,
        partlyBlocked: 0,
        clear: 0,
        lastCheckedAt: null,
        items: [],
      })),
      this.deps.floodExtents.history(unit.id, 5).catch(() => ({
        total: 0,
        active: 0,
        largestAreaM2: 0,
        latestAt: null,
        items: [],
      })),
      this.deps.rainfall.series({ adminUnitId: rainfallUnitId }).catch(() => ({
        adminUnit: toRef(unit),
        months: [],
        dataTypes: [],
        sources: [],
      })),
    ]);

    const currentMonthSuffix = `-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const sameCalendarMonths = rainfallSeries.months
      .filter((m) => m.yearMonth.endsWith(currentMonthSuffix) && m.rainfallMm !== null)
      .map((m) => m.rainfallMm as number);
    const historicalMonthAverageMm =
      sameCalendarMonths.length > 0
        ? sameCalendarMonths.reduce((a, b) => a + b, 0) / sameCalendarMonths.length
        : null;

    const commonInputs = {
      days: forecast.days,
      peakDischargeM3s: forecast.peakDischargeM3s,
      meanDischargeM3s: forecast.meanDischargeM3s,
      percentHighOrVeryHighRisk: riskArea?.percentHighOrVeryHigh ?? null,
      blockedDrainsCount: drainageSummary.needAttention,
      totalDrainsCount: drainageSummary.total,
      activeFloodsCount: floodHistory.active,
      historicalMonthAverageMm,
      expectedMonthlyRainfallMm: historicalMonthAverageMm,
    };

    const scored7d = computeFloodPrediction({ ...commonInputs, horizon: "7d" });
    const scoredSeasonal = computeFloodPrediction({ ...commonInputs, horizon: "seasonal" });

    const validFrom = now;
    const validTo7d = new Date(now.getTime() + 7 * 86_400_000);
    const validToSeasonal = new Date(now.getTime() + 30 * 86_400_000);

    const [sevenDay, seasonal] = await Promise.all([
      this.deps.predictions.upsert({
        adminUnitId: unit.id,
        countryCode: unit.countryCode,
        horizon: "7d",
        validFrom,
        validTo: validTo7d,
        riskLevel: scored7d.riskLevel,
        likelihoodScore: scored7d.likelihoodScore,
        forecastRainfallMm: scored7d.forecastRainfallMm,
        peakDailyRainfallMm: scored7d.peakDailyRainfallMm,
        peakDayDate: scored7d.peakDayDate,
        riverDischargeM3s: scored7d.riverDischargeM3s,
        riverDischargeRatio: scored7d.riverDischargeRatio,
        dailyForecast: forecast.days,
        drivers: scored7d.drivers,
        aiSummary: null,
        aiPreparedness: [],
        aiCaveats: null,
        aiProvider: null,
        aiModel: null,
        weatherProvider: forecast.weatherProvider,
      }),
      this.deps.predictions.upsert({
        adminUnitId: unit.id,
        countryCode: unit.countryCode,
        horizon: "seasonal",
        validFrom,
        validTo: validToSeasonal,
        riskLevel: scoredSeasonal.riskLevel,
        likelihoodScore: scoredSeasonal.likelihoodScore,
        forecastRainfallMm: scoredSeasonal.forecastRainfallMm,
        peakDailyRainfallMm: scoredSeasonal.peakDailyRainfallMm,
        peakDayDate: scoredSeasonal.peakDayDate,
        riverDischargeM3s: scoredSeasonal.riverDischargeM3s,
        riverDischargeRatio: scoredSeasonal.riverDischargeRatio,
        dailyForecast: forecast.days,
        drivers: scoredSeasonal.drivers,
        aiSummary: null,
        aiPreparedness: [],
        aiCaveats: null,
        aiProvider: null,
        aiModel: null,
        weatherProvider: forecast.weatherProvider,
      }),
    ]);

    return { sevenDay, seasonal };
  }

  private async buildPromptInputFor(
    unit: AdminUnitSummary,
    prediction: FloodPredictionDto,
  ): Promise<FloodOutlookPromptInput> {
    const parent = unit.parentId ? await this.deps.units.findSummaryById(unit.parentId) : null;
    const drainage = await this.deps.drainage.summary(unit.id, 10).catch(() => null);
    const blockedDrainNames = (drainage?.items ?? [])
      .filter((d) => d.condition === "blocked" || d.condition === "overflowing" || d.condition === "damaged")
      .map((d) => d.name ?? d.kind.replace(/_/g, " "))
      .slice(0, 6);

    return {
      areaName: unit.unitName,
      levelName: unit.levelName,
      parentName: parent?.unitName ?? null,
      riskLevel: prediction.riskLevel,
      likelihoodScore: prediction.likelihoodScore,
      forecastRainfallMm: prediction.forecastRainfallMm,
      peakDailyRainfallMm: prediction.peakDailyRainfallMm,
      peakDayDate: prediction.peakDayDate,
      riverDischargeM3s: prediction.riverDischargeM3s,
      riverDischargeRatio: prediction.riverDischargeRatio,
      dailyForecast: prediction.dailyForecast,
      drivers: prediction.drivers,
      blockedDrainNames,
    };
  }
}

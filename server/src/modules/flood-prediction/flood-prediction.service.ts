import type { AuthUser } from "../../common/access/auth-user";
import { RegionAccess } from "../../common/access/region-access";
import { forEachWithLimit } from "../../common/concurrency/for-each-with-limit";
import { NotFoundError, ValidationError } from "../../common/errors/app-error";
import { domainEvents } from "../../common/events/domain-events";
import { logger } from "../../config/logger";
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
import {
  DEFAULT_OUTLOOK_DAYS,
  LIVE_FORECAST_DAYS,
  type AlertDraftDto,
  type AreaFloodOutlookDto,
  type FloodPredictionDto,
  type FloodPredictionListDto,
  type FloodPredictionSettingsDto,
  type ForecastSnapshot,
  type IFloodPredictionRepository,
  type IForecastFetcher,
  type PublicFloodOutlookDto,
} from "./flood-prediction.types";
import { OpenMeteoForecastFetcher } from "./forecast-fetcher";
import { computeFloodPrediction, type ScoringInputs } from "./prediction-scorer";

/**
 * How many LGAs are recomputed at once. Enough to hide the weather API's delay; few enough to leave
 * most of the small database pool (DATABASE_POOL_MAX, 5 by default) free for everyone else's requests.
 */
const REFRESH_CONCURRENCY = 4;

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
  private readonly refreshing = new Map<string, Promise<number>>();

  constructor(private readonly deps: FloodPredictionDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Lists predictions for all LGAs in a country for an outlook of `days` days.
   * If none have been computed yet, computes them on the fly so the map layer and Alerts page
   * always have fresh predictions ready.
   */
  async list(countryCode: string, days: number = DEFAULT_OUTLOOK_DAYS): Promise<FloodPredictionListDto> {
    let items = await this.deps.predictions.findByCountry(countryCode, days);
    if (items.length === 0) {
      await this.recomputeCountry(countryCode, [days]);
      items = await this.deps.predictions.findByCountry(countryCode, days);
    }
    const generatedAt = items.length > 0 ? items[0]!.updatedAt : null;
    return { countryCode, horizonDays: days, generatedAt, items };
  }

  /**
   * Detailed outlook for one LGA or Ward, looking `days` days ahead.
   * Computes and stores the prediction on first read if not yet present.
   */
  async area(adminUnitId: string, days: number = DEFAULT_OUTLOOK_DAYS): Promise<AreaFloodOutlookDto> {
    const unit = await this.deps.units.findSummaryById(adminUnitId);
    if (!unit) throw new NotFoundError("Admin unit");

    const outlook =
      (await this.deps.predictions.findByUnit(adminUnitId, days)) ?? (await this.computeAndStoreForUnit(unit, [days])).get(days)!;

    return { adminUnit: toRef(unit), horizonDays: days, outlook };
  }

  /**
   * Refreshes the predictions for all LGAs in a country, for every number of days in use.
   */
  async refreshCountry(countryCode: string, actor?: AuthUser): Promise<FloodPredictionListDto> {
    const lgaCount = await this.recomputeCountry(countryCode);

    if (actor) {
      await this.deps.audit.record(actor, {
        action: "flood_prediction.refreshed",
        entityType: "flood_prediction",
        entityId: null,
        summary: `Refreshed flood predictions for ${lgaCount} LGAs in ${countryCode}`,
        details: { countryCode, lgaCount },
      });
    }

    domainEvents.emit("prediction.updated", { countryCode });
    // Read the result directly: list() refreshes an empty country, so calling it here would loop
    // for ever for a country that has no LGAs.
    const items = await this.deps.predictions.findByCountry(countryCode, DEFAULT_OUTLOOK_DAYS);
    return {
      countryCode,
      horizonDays: DEFAULT_OUTLOOK_DAYS,
      generatedAt: items[0]?.updatedAt ?? null,
      items,
    };
  }

  /**
   * Recomputes every LGA of a country and returns how many there were. Each LGA is scored for every
   * number of days that matters: the default week, the public home page's setting, every number already
   * computed (so none of them goes stale), and any in `alsoDays`. A few LGAs are worked on at once,
   * because each one mostly waits on the weather API and the database. If a refresh of the same
   * country is already running (a second click, or a client that timed out and asked again), the
   * caller joins it, so repeated requests never pile up extra work.
   */
  private recomputeCountry(countryCode: string, alsoDays: number[] = []): Promise<number> {
    const key = `${countryCode}:${[...alsoDays].sort((a, b) => a - b).join(",")}`;
    const running = this.refreshing.get(key);
    if (running) return running;

    const run = (async () => {
      const [{ items: lgas }, settings, inUse] = await Promise.all([
        this.deps.units.findSummaries({ countryCode, level: 2, page: 1, pageSize: 100 }),
        this.deps.predictions.getSettings(),
        this.deps.predictions.horizonsInUse(countryCode),
      ]);
      const days = [...new Set([DEFAULT_OUTLOOK_DAYS, settings.publicOutlookDays, ...inUse, ...alsoDays])];
      await forEachWithLimit(lgas, REFRESH_CONCURRENCY, (lga) => this.computeAndStoreForUnit(lga, days));
      return lgas.length;
    })().finally(() => this.refreshing.delete(key));

    this.refreshing.set(key, run);
    return run;
  }

  /**
   * Runs `AiService.generateJson` (`flood_outlook_draft`) to synthesize a plain-English narrative
   * and preparedness checklist for a specific LGA or Ward.
   */
  async generateAiOutlook(adminUnitId: string, days: number, actor: AuthUser): Promise<FloodPredictionDto> {
    const unit = await this.deps.units.findSummaryById(adminUnitId);
    if (!unit) throw new NotFoundError("Admin unit");

    const target = (await this.computeAndStoreForUnit(unit, [days])).get(days)!;
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
      horizonDays: target.horizonDays,
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

      const prediction =
        (await this.deps.predictions.findByUnit(id, DEFAULT_OUTLOOK_DAYS)) ??
        (await this.computeAndStoreForUnit(unit, [DEFAULT_OUTLOOK_DAYS])).get(DEFAULT_OUTLOOK_DAYS)!;
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
    patch: { showPublicFloodOutlook?: boolean; publicOutlookDays?: number },
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
      summary: `${updated.showPublicFloodOutlook ? "Enabled" : "Hid"} public flood outlook on the landing page (${updated.publicOutlookDays} days)`,
      details: {
        showPublicFloodOutlook: updated.showPublicFloodOutlook,
        publicOutlookDays: updated.publicOutlookDays,
      },
    });
    domainEvents.emit("prediction.updated", { countryCode: "NGA" });

    // A new number of days has no outlooks yet. Start computing them now, so the first visitor to the
    // home page does not wait for a whole country to be worked out. Not awaited: it takes a while, and
    // a failure here only means that first visitor computes them instead.
    if (patch.publicOutlookDays !== undefined) {
      void this.recomputeCountry("NGA", [updated.publicOutlookDays]).catch((err) =>
        logger.warn({ err }, "Could not precompute the public flood outlook for the new number of days"),
      );
    }
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
        horizonDays: settings.publicOutlookDays,
        generatedAt: null,
        weatherProvider: "Open-Meteo & GloFAS",
        items: [],
      };
    }

    const list = await this.list(countryCode, settings.publicOutlookDays);
    return {
      enabled: true,
      horizonDays: settings.publicOutlookDays,
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

  /**
   * Gathers everything the score depends on once (the forecast, terrain, drains, floods, rainfall
   * history), then scores and stores an outlook for each number of days asked for.
   */
  private async computeAndStoreForUnit(
    unit: AdminUnitSummary,
    horizonDays: number[],
  ): Promise<Map<number, FloodPredictionDto>> {
    const now = this.now();
    const [lon, lat] = unit.centroid;
    const rainfallUnitId = unit.level === 3 && unit.parentId ? unit.parentId : unit.id;

    const [forecast, riskArea, drainageSummary, floodHistory, rainfallSeries] = await Promise.all([
      this.deps.fetcher.fetchForecast(lon, lat, now),
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
      meanDischargeM3s: forecast.meanDischargeM3s,
      percentHighOrVeryHighRisk: riskArea?.percentHighOrVeryHigh ?? null,
      blockedDrainsCount: drainageSummary.needAttention,
      totalDrainsCount: drainageSummary.total,
      activeFloodsCount: floodHistory.active,
      historicalMonthAverageMm,
      expectedMonthlyRainfallMm: historicalMonthAverageMm,
    };

    const outlooks = await Promise.all(
      [...new Set(horizonDays)].map((days) => this.scoreAndStore(unit, forecast, commonInputs, days, now)),
    );
    return new Map(outlooks.map((outlook) => [outlook.horizonDays, outlook]));
  }

  private scoreAndStore(
    unit: AdminUnitSummary,
    forecast: ForecastSnapshot,
    commonInputs: Omit<ScoringInputs, "horizonDays">,
    days: number,
    now: Date,
  ): Promise<FloodPredictionDto> {
    const scored = computeFloodPrediction({ ...commonInputs, horizonDays: days });
    return this.deps.predictions.upsert({
      adminUnitId: unit.id,
      countryCode: unit.countryCode,
      horizonDays: days,
      validFrom: now,
      validTo: new Date(now.getTime() + days * 86_400_000),
      riskLevel: scored.riskLevel,
      likelihoodScore: scored.likelihoodScore,
      forecastRainfallMm: scored.forecastRainfallMm,
      peakDailyRainfallMm: scored.peakDailyRainfallMm,
      peakDayDate: scored.peakDayDate,
      riverDischargeM3s: scored.riverDischargeM3s,
      riverDischargeRatio: scored.riverDischargeRatio,
      // Only the days that are really forecast; the days after them have no forecast to show.
      dailyForecast: forecast.days.slice(0, Math.min(days, LIVE_FORECAST_DAYS)),
      drivers: scored.drivers,
      aiSummary: null,
      aiPreparedness: [],
      aiCaveats: null,
      aiProvider: null,
      aiModel: null,
      weatherProvider: forecast.weatherProvider,
    });
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
      horizonDays: prediction.horizonDays,
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

import type { AuthUser } from "../../../common/access/auth-user";
import { PermissionResolver } from "../../../common/access/permission-resolver";
import type { Permission } from "../../../common/access/permissions";
import { logger } from "../../../config/logger";
import { AdminUnitRepository } from "../../admin-units/admin-unit.repository";
import type { IAdminUnitRepository } from "../../admin-units/admin-unit.types";
import { AlertService } from "../../alerts/alert.service";
import { FloodPredictionRepository } from "../../flood-prediction/flood-prediction.repository";
import { DEFAULT_OUTLOOK_DAYS, type IFloodPredictionRepository } from "../../flood-prediction/flood-prediction.types";
import { RoleRepository } from "../../roles/role.repository";
import { AiService } from "../ai.service";
import { inert } from "../domain/prompt-safety";
import type { AiKeySource } from "../ai.types";
import type { AiChatMessage, AiProviderId } from "../providers/ai-provider";
import { buildAssistantSystemPrompt, type AssistantContext } from "./assistant.prompt";

/** The alerts the assistant is told about: enough to answer "is there an alert near me?" without a huge prompt. */
const MAX_ALERTS = 15;

export interface AssistantDeps {
  ai: Pick<AiService, "streamText">;
  alerts: Pick<AlertService, "list">;
  units: Pick<IAdminUnitRepository, "findSummaryById">;
  predictions: Pick<IFloodPredictionRepository, "findByUnit">;
  permissionsFor: (role: string) => Promise<readonly Permission[]>;
  roleName: (code: string) => Promise<string>;
  now?: () => Date;
}

export interface AssistantChatInput {
  messages: AiChatMessage[];
  /** The place on screen, or the person's home area. Optional. */
  areaId?: string;
  /** The path of the page they have open. Optional. */
  page?: string;
}

/** POST /api/v1/ai/chat. Mirrored by AssistantReply in client/src/types/ai.types.ts. */
export interface AssistantReplyDto {
  reply: string;
  provider: AiProviderId;
  model: string;
  source: AiKeySource;
}

/**
 * The in-app AI assistant (docs/ai-assistant.md). It reads the platform's current data through the same
 * services and repositories the screens use (alerts in force, the stored flood outlook of the place in
 * view), puts it in the system prompt, and asks the AI for a plain-text answer. Nothing is saved: the
 * conversation lives in the browser, and the usage log keeps only token counts.
 */
export class AssistantService {
  private static _instance?: AssistantService;
  static get Instance(): AssistantService {
    return (this._instance ??= new AssistantService({
      ai: AiService.Instance,
      alerts: AlertService.Instance,
      units: AdminUnitRepository.Instance,
      predictions: FloodPredictionRepository.Instance,
      permissionsFor: (role) => PermissionResolver.Instance.permissionsFor(role),
      roleName: async (code) => (await RoleRepository.Instance.findByCode(code))?.name ?? code,
    }));
  }

  private readonly now: () => Date;

  constructor(private readonly deps: AssistantDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async chat(input: AssistantChatInput, actor: AuthUser): Promise<AssistantReplyDto> {
    const context = await this.buildContext(input, actor);
    const result = await this.deps.ai.streamText(
      actor,
      {
        feature: "assistant_chat",
        system: buildAssistantSystemPrompt(context),
        messages: input.messages.map((m) => ({ role: m.role, content: inert(m.content) })),
        maxOutputTokens: 1500,
      },
      () => {},
    );

    const reply = result.text.trim();
    return {
      reply: reply || "Sorry, I couldn't put an answer together. Try asking again in a different way.",
      provider: result.provider,
      model: result.model,
      source: result.source,
    };
  }

  /** Every lookup is best-effort: a missing piece makes the answer less specific, never fails the chat. */
  private async buildContext(input: AssistantChatInput, actor: AuthUser): Promise<AssistantContext> {
    const [permissions, roleName, alerts, area] = await Promise.all([
      this.deps.permissionsFor(actor.role).catch(() => [] as readonly Permission[]),
      this.deps.roleName(actor.role).catch(() => actor.role),
      this.deps.alerts.list({ view: "active" }).catch((err: unknown) => {
        logger.warn({ err }, "Assistant could not read the alerts in force");
        return [];
      }),
      input.areaId ? this.areaContext(input.areaId) : Promise.resolve(null),
    ]);

    return {
      today: this.now(),
      userName: actor.displayName,
      roleName,
      isAdministrator: actor.role === "administrator",
      permissions,
      activeAlerts: alerts.slice(0, MAX_ALERTS).map((a) => ({
        severity: a.severity,
        title: a.title,
        areas: a.areas.map((x) => x.unitName),
        expiresAt: a.expiresAt.slice(0, 16).replace("T", " ") + " UTC",
        actions: a.actions,
      })),
      area,
      page: input.page ?? null,
    };
  }

  private async areaContext(areaId: string): Promise<AssistantContext["area"]> {
    try {
      const unit = await this.deps.units.findSummaryById(areaId);
      if (!unit) return null;
      const [parent, outlook] = await Promise.all([
        unit.parentId ? this.deps.units.findSummaryById(unit.parentId) : Promise.resolve(null),
        this.deps.predictions.findByUnit(unit.id, DEFAULT_OUTLOOK_DAYS),
      ]);
      return {
        name: unit.unitName,
        levelName: unit.levelName,
        parentName: parent?.unitName ?? null,
        outlook: outlook
          ? {
              horizonDays: outlook.horizonDays,
              riskLevel: outlook.riskLevel,
              likelihoodScore: outlook.likelihoodScore,
              forecastRainfallMm: outlook.forecastRainfallMm,
              peakDailyRainfallMm: outlook.peakDailyRainfallMm,
              peakDayDate: outlook.peakDayDate,
              factors: outlook.drivers.factors,
              aiSummary: outlook.aiSummary,
              updatedAt: outlook.updatedAt.slice(0, 10),
            }
          : null,
      };
    } catch (err) {
      logger.warn({ err, areaId }, "Assistant could not read the area in view");
      return null;
    }
  }
}

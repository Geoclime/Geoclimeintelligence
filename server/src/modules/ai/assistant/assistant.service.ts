import type { AuthUser } from "../../../common/access/auth-user";
import { PermissionResolver } from "../../../common/access/permission-resolver";
import type { Permission } from "../../../common/access/permissions";
import { ConflictError, NotFoundError } from "../../../common/errors/app-error";
import { logger } from "../../../config/logger";
import { AdminUnitRepository } from "../../admin-units/admin-unit.repository";
import type { IAdminUnitRepository } from "../../admin-units/admin-unit.types";
import { AlertService } from "../../alerts/alert.service";
import { FloodPredictionRepository } from "../../flood-prediction/flood-prediction.repository";
import { DEFAULT_OUTLOOK_DAYS, type IFloodPredictionRepository } from "../../flood-prediction/flood-prediction.types";
import { RoleRepository } from "../../roles/role.repository";
import { AiService } from "../ai.service";
import { inert } from "../domain/prompt-safety";
import { buildAssistantSystemPrompt, type AssistantContext } from "./assistant.prompt";
import { AiConversationRepository } from "./assistant.repository";
import type { AiConversationDto, AiConversationSummaryDto, AssistantReplyDto, IAiConversationRepository } from "./assistant.types";

/** The alerts the assistant is told about: enough to answer "is there an alert near me?" without a huge prompt. */
const MAX_ALERTS = 15;
/** Earlier turns sent with each question (an even number, so they start with a question). */
const HISTORY_TURNS = 18;
/** A chat longer than this is closed: a new one starts fresh and costs less per question. */
export const MAX_CONVERSATION_MESSAGES = 200;
/** The history list shows this many of the most recent chats. */
const LIST_LIMIT = 100;
const TITLE_LENGTH = 80;

/** A chat is named after its first question, cut at a word. */
function titleFrom(question: string): string {
  const oneLine = question.replace(/\s+/g, " ").trim();
  if (oneLine.length <= TITLE_LENGTH) return oneLine;
  const cut = oneLine.slice(0, TITLE_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export interface AssistantDeps {
  ai: Pick<AiService, "streamText">;
  conversations: IAiConversationRepository;
  alerts: Pick<AlertService, "list">;
  units: Pick<IAdminUnitRepository, "findSummaryById">;
  predictions: Pick<IFloodPredictionRepository, "findByUnit">;
  permissionsFor: (role: string) => Promise<readonly Permission[]>;
  roleName: (code: string) => Promise<string>;
  now?: () => Date;
}

export interface AssistantChatInput {
  /** The chat to carry on; left out to start a new one. */
  conversationId?: string;
  message: string;
  /** The place on screen, or the person's home area. Optional. */
  areaId?: string;
  /** The path of the page they have open. Optional. */
  page?: string;
}

/**
 * The in-app AI assistant (docs/ai-assistant.md). It reads the platform's current data through the same
 * services and repositories the screens use (alerts in force, the stored flood outlook of the place in
 * view), puts it in the system prompt, and asks the AI for a plain-text answer. Each person's chats are
 * kept so they can reopen or delete them; only their owner can read them. The usage log keeps only counts.
 */
export class AssistantService {
  private static _instance?: AssistantService;
  static get Instance(): AssistantService {
    return (this._instance ??= new AssistantService({
      ai: AiService.Instance,
      conversations: AiConversationRepository.Instance,
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

  /**
   * Answers a question, in a new chat or one the person already has. The question and answer are saved
   * together only once the answer has arrived, so a failed question leaves no trace and can be asked again.
   */
  async chat(input: AssistantChatInput, actor: AuthUser): Promise<AssistantReplyDto> {
    const question = input.message.trim();
    let history: { role: "user" | "assistant"; content: string }[] = [];
    if (input.conversationId) {
      const conversation = await this.deps.conversations.find(actor.id, input.conversationId);
      if (!conversation) throw new NotFoundError("Chat");
      if (conversation.messageCount >= MAX_CONVERSATION_MESSAGES) {
        throw new ConflictError("This chat is as long as a chat can be. Start a new chat to keep going.");
      }
      history = await this.deps.conversations.recentMessages(conversation.id, HISTORY_TURNS);
    }

    const context = await this.buildContext(input, actor);
    const result = await this.deps.ai.streamText(
      actor,
      {
        feature: "assistant_chat",
        system: buildAssistantSystemPrompt(context),
        messages: [...history, { role: "user" as const, content: question }].map((m) => ({ role: m.role, content: inert(m.content) })),
        maxOutputTokens: 1500,
      },
      () => {},
    );

    const reply = result.text.trim() || "Sorry, I couldn't put an answer together. Try asking again in a different way.";
    const saved = await this.deps.conversations.appendExchange({
      userId: actor.id,
      conversationId: input.conversationId ?? null,
      title: titleFrom(question),
      question,
      answer: reply.slice(0, 20_000),
    });

    return {
      conversationId: saved.id,
      title: saved.title,
      reply,
      provider: result.provider,
      model: result.model,
      source: result.source,
    };
  }

  /** The person's chats, most recently used first. */
  list(actor: AuthUser): Promise<AiConversationSummaryDto[]> {
    return this.deps.conversations.list(actor.id, LIST_LIMIT);
  }

  async get(id: string, actor: AuthUser): Promise<AiConversationDto> {
    const conversation = await this.deps.conversations.find(actor.id, id);
    if (!conversation) throw new NotFoundError("Chat");
    const { messageCount: _count, ...rest } = conversation;
    return { ...rest, messages: await this.deps.conversations.messages(id) };
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    if (!(await this.deps.conversations.remove(actor.id, id))) throw new NotFoundError("Chat");
  }

  /** Deletes every chat the person has; replies with how many. */
  removeAll(actor: AuthUser): Promise<number> {
    return this.deps.conversations.removeAll(actor.id);
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

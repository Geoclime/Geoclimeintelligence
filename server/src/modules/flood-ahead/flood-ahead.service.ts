import { logger } from "../../config/logger";
import { FloodAheadRepository } from "./flood-ahead.repository";
import { FORGET_MARGIN_M, MAX_ACCURACY_M, MIN_UPDATE_GAP_MS, planWarnings } from "./flood-ahead.rules";
import type { FloodAheadAck, FloodAheadState, FloodAheadWarning, IFloodAheadRepository } from "./flood-ahead.types";
import { floodAheadUpdateSchema } from "./flood-ahead.validation";

export interface FloodAheadResult {
  /** Goes back to the sender whatever happened. */
  ack: FloodAheadAck;
  /** Floods the person has just come within a new distance of; empty most of the time. */
  warnings: FloodAheadWarning[];
}

/**
 * Warns someone who is travelling that they are coming up to a place that is flooded now.
 *
 * The browser sends its position over the live connection every few seconds. Each update is checked
 * against the floods near it, in PostGIS, and a warning goes back when the person comes within a new
 * distance of one (see flood-ahead.rules.ts). The position is used for that one check and then dropped:
 * it is not stored, not logged and not kept in memory. All a connection keeps (FloodAheadState) is which
 * floods it has already been warned about, so the same one isn't announced twice. No sign-in is needed:
 * the floods are what the public map shows.
 */
export class FloodAheadService {
  private static _instance?: FloodAheadService;
  static get Instance(): FloodAheadService {
    return (this._instance ??= new FloodAheadService(FloodAheadRepository.Instance));
  }

  constructor(
    private readonly repo: IFloodAheadRepository,
    private readonly now: () => number = Date.now,
  ) {}

  /** Handles one update from one connection. `state` is that connection's own memory and is changed here. */
  async check(update: unknown, state: FloodAheadState): Promise<FloodAheadResult> {
    const parsed = floodAheadUpdateSchema.safeParse(update);
    if (!parsed.success) return { ack: { ok: false, reason: "invalid" }, warnings: [] };

    const { lat, lon, radiusM, accuracy, fresh } = parsed.data;
    const at = this.now();
    if (!fresh && at - state.lastAt < MIN_UPDATE_GAP_MS) return { ack: { ok: false, reason: "too-fast" }, warnings: [] };
    state.lastAt = at;
    if (fresh) state.warned.clear();

    if (accuracy !== undefined && accuracy > MAX_ACCURACY_M) return { ack: { ok: false, reason: "inaccurate" }, warnings: [] };

    try {
      // A little farther than asked, so a flood just outside the distance is remembered, not forgotten.
      const nearby = await this.repo.findNear(lon, lat, radiusM + FORGET_MARGIN_M);
      const plan = planWarnings(nearby, radiusM, state.warned);
      state.warned = plan.warned;
      return { ack: { ok: true, floodsNearby: plan.floodsNearby, nearestM: plan.nearestM }, warnings: plan.warnings };
    } catch (err) {
      // Only the error, never the position it was asked about.
      logger.warn({ err }, "Could not check for floods near a position");
      return { ack: { ok: false, reason: "unavailable" }, warnings: [] };
    }
  }
}

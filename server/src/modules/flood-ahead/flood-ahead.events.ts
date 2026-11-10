import { RealtimeGateway } from "../../common/realtime/realtime-gateway";
import { FloodAheadService } from "./flood-ahead.service";
import type { FloodAheadState } from "./flood-ahead.types";

/**
 * Starts listening for positions from browsers.
 *
 *   location:update  (from the browser) where I am now, how far ahead to warn, and how sure the device
 *                    is: { lat, lon, radiusM, accuracy }. Answered at once with what was checked
 *                    ({ ok, floodsNearby, nearestM }).
 *   flood:ahead      (to that browser only) { warnings }: floods it has just come within a new distance
 *                    of, nearest first. Never sent to a room, so nobody else learns where anyone is.
 *
 * Registered once at startup (server.ts), after the gateway is attached. Tests register nothing.
 */
export function registerFloodAhead(): void {
  RealtimeGateway.Instance.onClientEvent("location:update", async (payload, client) => {
    const state = (client.data.floodAhead ??= { lastAt: 0, warned: new Map<string, number>() }) as FloodAheadState;
    const { ack, warnings } = await FloodAheadService.Instance.check(payload, state);
    if (warnings.length > 0) client.emit("flood:ahead", { warnings });
    return ack;
  });
}

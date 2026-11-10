import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { AuthService } from "../../modules/auth/auth.service";
import { PermissionResolver } from "../access/permission-resolver";

/** Every connection joins this room: what everyone may hear, signed in or not. */
export const PUBLIC_ROOM = "public";
/** Responders, officials and administrators: who sees the flood report review queue. */
export const REVIEWERS_ROOM = "reviewers";
export const ADMINISTRATORS_ROOM = "administrators";

/** What a handler of a browser's event may do: keep notes for this one connection, and answer on it. */
export interface RealtimeClient {
  /** Lives as long as this connection does, and no longer; nothing here is stored. */
  data: Record<string, unknown>;
  /** Sends to this one connection only, never to a room. */
  emit(event: string, payload: unknown): void;
}

/** Handles one event from a browser. What it returns is sent back to the sender as the acknowledgement. */
export type ClientEventHandler = (payload: unknown, client: RealtimeClient) => unknown;

/**
 * Live updates to browsers over Socket.IO, attached to the API's own HTTP server.
 *
 * - A visitor who is not signed in connects without a token and joins only the public room: they
 *   hear that the public alert map changed (so the landing page updates itself), nothing else. A
 *   token that is present must be valid, checked exactly as the REST API checks it; a forged or
 *   expired one is refused.
 * - A signed-in connection also joins its private room, `user:<id>` (their notifications, their
 *   reports, their account), and the rooms of its role (the review queue; the user list).
 * - Every event is a small "this changed" signal with an id, never the data itself: the browser
 *   asks the REST API, which applies the usual access rules. Nothing is ever sent over a socket
 *   that the REST API wouldn't give the same person.
 * - The one exception to "the server only talks" is an event the browser sends and a feature has
 *   registered for (onClientEvent). The answer goes back to the sender alone, and only carries what
 *   that person already could read (e.g. flood-ahead warnings: public flood data, near their own position).
 * Before attach() (and in tests) every emit is a no-op.
 */
export class RealtimeGateway {
  private static _instance?: RealtimeGateway;
  static get Instance(): RealtimeGateway {
    return (this._instance ??= new RealtimeGateway());
  }

  private io: Server | null = null;
  private readonly clientHandlers = new Map<string, ClientEventHandler>();

  /**
   * Listens for `event` from every connection, signed in or not, and answers the sender with whatever
   * `handler` returns. Register at startup; a connection picks up the handlers present when it opens.
   * A handler that throws is logged and the sender is told `{ ok: false }`: it never crashes the server.
   */
  onClientEvent(event: string, handler: ClientEventHandler): void {
    this.clientHandlers.set(event, handler);
  }

  attach(server: HttpServer): void {
    this.io = new Server(server, {
      cors: { origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false },
      // Small payloads only: nothing larger than a notification travels this way.
      maxHttpBufferSize: 64 * 1024,
    });

    this.io.use(async (socket, next) => {
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      // No token: not signed in, so public events only.
      if (token === undefined || token === null || token === "") return next();
      try {
        if (typeof token !== "string") throw new Error("bad token");
        const identity = await AuthService.Instance.verifyToken(token);
        const user = await AuthService.Instance.resolveUser(identity);
        socket.data.userId = user.id;
        socket.data.role = user.role;
        next();
      } catch {
        next(new Error("unauthorized"));
      }
    });

    this.io.on("connection", (socket) => {
      void socket.join(PUBLIC_ROOM);
      for (const [event, handler] of this.clientHandlers) {
        socket.on(event, async (payload: unknown, ack?: unknown) => {
          const reply = typeof ack === "function" ? (ack as (result: unknown) => void) : () => undefined;
          try {
            reply(await handler(payload, { data: socket.data, emit: (name, body) => socket.emit(name, body) }));
          } catch (err) {
            // Only the error: the payload may be someone's position.
            logger.error({ err, event }, "A realtime client event failed");
            reply({ ok: false });
          }
        });
      }
      const userId = socket.data.userId as string | undefined;
      if (!userId) return;
      void socket.join(`user:${userId}`);
      const role = socket.data.role as string;
      // The review queue's room is for whoever may review: a permission, so a role made on the Roles screen joins too.
      void PermissionResolver.Instance.has({ role }, "reports.review").then((reviewer) => {
        if (reviewer) void socket.join(REVIEWERS_ROOM);
      });
      if (role === "administrator") void socket.join(ADMINISTRATORS_ROOM);
    });

    logger.info("Realtime gateway attached");
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.io?.to(`user:${userId}`).emit(event, payload);
  }

  emitToRoom(room: string, event: string, payload: unknown): void {
    this.io?.to(room).emit(event, payload);
  }

  /** Everyone connected, signed in or not: only for events that carry nothing private. */
  emitToAll(event: string, payload: unknown): void {
    this.io?.to(PUBLIC_ROOM).emit(event, payload);
  }

  close(): Promise<void> {
    return new Promise((resolve) => (this.io ? this.io.close(() => resolve()) : resolve()));
  }
}

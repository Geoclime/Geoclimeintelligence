import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { AuthService } from "../../modules/auth/auth.service";

/** Every connection joins this room: what everyone may hear, signed in or not. */
export const PUBLIC_ROOM = "public";
/** Responders, officials and administrators: who sees the flood report review queue. */
export const REVIEWERS_ROOM = "reviewers";
export const ADMINISTRATORS_ROOM = "administrators";

const REVIEWER_ROLES = new Set(["emergency_responder", "government_official", "administrator"]);

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
 * Before attach() (and in tests) every emit is a no-op.
 */
export class RealtimeGateway {
  private static _instance?: RealtimeGateway;
  static get Instance(): RealtimeGateway {
    return (this._instance ??= new RealtimeGateway());
  }

  private io: Server | null = null;

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
      const userId = socket.data.userId as string | undefined;
      if (!userId) return;
      void socket.join(`user:${userId}`);
      const role = socket.data.role as string;
      if (REVIEWER_ROLES.has(role)) void socket.join(REVIEWERS_ROOM);
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

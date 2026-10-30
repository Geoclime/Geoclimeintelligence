import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { AuthService } from "../../modules/auth/auth.service";

/**
 * Live updates to signed-in browsers over Socket.IO, attached to the API's own HTTP server.
 *
 * - A connection must carry a Firebase ID token (`auth: { token }`), checked exactly as the REST
 *   API checks it; the socket then joins one private room, `user:<id>`.
 * - Events go to one person (`emitToUser`: their notifications) or to everyone signed in
 *   (`emitToAll`: "alerts changed", so open alert pages refresh themselves).
 * - Nothing is ever sent over a socket that the REST API wouldn't give the same person.
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
      try {
        const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
        if (typeof token !== "string" || token === "") throw new Error("missing token");
        const identity = await AuthService.Instance.verifyToken(token);
        const user = await AuthService.Instance.resolveUser(identity);
        socket.data.userId = user.id;
        next();
      } catch {
        next(new Error("unauthorized"));
      }
    });

    this.io.on("connection", (socket) => {
      void socket.join(`user:${socket.data.userId as string}`);
    });

    logger.info("Realtime gateway attached");
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.io?.to(`user:${userId}`).emit(event, payload);
  }

  emitToAll(event: string, payload: unknown): void {
    this.io?.emit(event, payload);
  }

  close(): Promise<void> {
    return new Promise((resolve) => (this.io ? this.io.close(() => resolve()) : resolve()));
  }
}

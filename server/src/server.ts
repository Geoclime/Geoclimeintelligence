import "reflect-metadata";
import { createApp } from "./app";
import { EmailOutbox } from "./common/email/email-outbox";
import { registerRealtimeListeners } from "./common/realtime/realtime-events";
import { RealtimeGateway } from "./common/realtime/realtime-gateway";
import { AppDataSource } from "./config/data-source";
import { env } from "./config/env";
import { canSendPush } from "./config/firebase";
import { logger } from "./config/logger";
import { registerFloodAhead } from "./modules/flood-ahead/flood-ahead.events";
import { registerNotificationListeners } from "./modules/notifications/notification-events";

async function main() {
  await AppDataSource.initialize();
  logger.info("Database connected");
  if (env.NODE_ENV === "production" && !env.AI_KEYS_SECRET) {
    logger.warn("AI_KEYS_SECRET is not set: AI provider keys cannot be saved, so AI features are off");
  }

  const server = createApp().listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  // Live updates (Socket.IO on the same port), notifications for what happens, and the email worker.
  RealtimeGateway.Instance.attach(server);
  registerRealtimeListeners();
  registerFloodAhead();
  registerNotificationListeners();
  EmailOutbox.Instance.start();
  logger.info({ email: env.EMAIL_PROVIDER, push: canSendPush ? "fcm" : "off" }, "Notification channels");

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    EmailOutbox.Instance.stop();
    void RealtimeGateway.Instance.close().finally(() =>
      server.close(() => {
        void AppDataSource.destroy().finally(() => process.exit(0));
      }),
    );
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, "Failed to start");
  process.exit(1);
});

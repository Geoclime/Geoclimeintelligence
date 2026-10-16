import "reflect-metadata";
import { createApp } from "./app";
import { AppDataSource } from "./config/data-source";
import { env } from "./config/env";
import { logger } from "./config/logger";

async function main() {
  await AppDataSource.initialize();
  logger.info("Database connected");
  if (env.NODE_ENV === "production" && !env.AI_KEYS_SECRET) {
    logger.warn("AI_KEYS_SECRET is not set: AI provider keys cannot be saved, so AI features are off");
  }

  const server = createApp().listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => {
      void AppDataSource.destroy().finally(() => process.exit(0));
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, "Failed to start");
  process.exit(1);
});

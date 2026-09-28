import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { ok } from "./common/response/api-response";
import { env } from "./config/env";
import { authMiddleware, resolveUserMiddleware } from "./middleware/auth.middleware";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.middleware";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/user.routes";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false }));
  app.use(express.json({ limit: "1mb" }));

  // Unauthenticated liveness probe, deliberately outside /api/v1.
  app.get("/health", (_req, res) => {
    res.json(ok({ status: "ok" }));
  });

  // Auth and user resolution run exactly ONCE per request, mounted here before any feature
  // router -- never re-declared inside a router. See section 11's production incident.
  app.use("/api/v1", authMiddleware, resolveUserMiddleware);

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/users", usersRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

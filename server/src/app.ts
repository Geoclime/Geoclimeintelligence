import compression from "compression";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { ok } from "./common/response/api-response";
import { env } from "./config/env";
import { authMiddleware, resolveUserMiddleware } from "./middleware/auth.middleware";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.middleware";
import { adminUnitsRouter } from "./modules/admin-units/admin-unit.routes";
import { alertsRouter } from "./modules/alerts/alert.routes";
import { floodReportsRouter } from "./modules/flood-reports/flood-report.routes";
import { notificationsRouter } from "./modules/notifications/notification.routes";
import { countriesRouter } from "./modules/admin-units/country.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { dataSourcesRouter } from "./modules/data-sources/data-source.routes";
import { importsRouter } from "./modules/data-sources/imports/import.routes";
import { buildingsRouter, infrastructureRouter, mapLayersRouter, roadsRouter, settlementsRouter, waterwaysRouter } from "./modules/map-layers/map-layer.routes";
import { publicRouter } from "./modules/public/public.routes";
import { rainfallRouter } from "./modules/rainfall/rainfall.routes";
import { usersRouter } from "./modules/users/user.routes";

export function createApp(): Express {
  const app = express();

  // Behind Render's proxy, req.ip is the proxy unless Express is told how many hops to trust.
  // The public routes' rate limit is per client IP, so this must match the deployment.
  if (env.TRUST_PROXY_HOPS > 0) app.set("trust proxy", env.TRUST_PROXY_HOPS);

  app.use(helmet());
  // Map shapes are the largest replies (a whole-state view is over a megabyte of GeoJSON) and
  // compress about five-fold, which is most of the wait on a phone. Replies under 1 KB are left alone.
  app.use(compression());
  // Content-Disposition is exposed so the browser can read a template download's file name.
  app.use(cors({ origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false, exposedHeaders: ["Content-Disposition"] }));
  app.use(express.json({ limit: "1mb" }));

  // Unauthenticated liveness probe, deliberately outside /api/v1.
  app.get("/health", (_req, res) => {
    res.json(ok({ status: "ok" }));
  });

  // The landing page's reads: the only /api/v1 routes that need no sign-in. Mounted before the
  // auth middleware, and answers every path under it itself (unknown ones with a 404).
  app.use("/api/v1/public", publicRouter);

  // Auth and user resolution run exactly ONCE per request, mounted here before any feature
  // router -- never re-declared inside a router. See section 11's production incident.
  app.use("/api/v1", authMiddleware, resolveUserMiddleware);

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/countries", countriesRouter);
  app.use("/api/v1/admin-units", adminUnitsRouter);
  app.use("/api/v1/data-sources", dataSourcesRouter);
  app.use("/api/v1/imports", importsRouter);
  app.use("/api/v1/map-layers", mapLayersRouter);
  app.use("/api/v1/roads", roadsRouter);
  app.use("/api/v1/waterways", waterwaysRouter);
  app.use("/api/v1/settlements", settlementsRouter);
  app.use("/api/v1/infrastructure", infrastructureRouter);
  app.use("/api/v1/buildings", buildingsRouter);
  app.use("/api/v1/rainfall", rainfallRouter);
  app.use("/api/v1/alerts", alertsRouter);
  app.use("/api/v1/flood-reports", floodReportsRouter);
  app.use("/api/v1/notifications", notificationsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

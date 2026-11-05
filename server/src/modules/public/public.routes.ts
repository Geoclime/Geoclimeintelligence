import { Router } from "express";
import { notFoundHandler } from "../../middleware/error-handler.middleware";
import { rateLimit } from "../../middleware/rate-limit.middleware";
import { validate } from "../../middleware/validate.middleware";
import { PublicController } from "./public.controller";
import { publicAreaSchema, publicLocateSchema, publicSearchSchema } from "./public.validation";

/** Requests one visitor (one IP) may make per minute: a busy landing page uses about ten. */
export const PUBLIC_REQUESTS_PER_MINUTE = 120;

// Mounted at /api/v1/public in app.ts, BEFORE the auth middleware: these are the only /api/v1
// routes that need no sign-in, so they are rate limited instead. Read-only, summaries only.
export const publicRouter = Router();

publicRouter.use(rateLimit({ windowMs: 60_000, max: PUBLIC_REQUESTS_PER_MINUTE }));

publicRouter.get("/overview", PublicController.overview);
publicRouter.get("/outline", PublicController.outline);
publicRouter.get("/alert-map", PublicController.alertMap);
publicRouter.get("/search", validate(publicSearchSchema), PublicController.search);
publicRouter.get("/locate", validate(publicLocateSchema), PublicController.locate);
publicRouter.get("/areas/:id", validate(publicAreaSchema), PublicController.area);

// An unknown public path is a 404 here, never a fall-through to the auth middleware's 401.
publicRouter.use(notFoundHandler);

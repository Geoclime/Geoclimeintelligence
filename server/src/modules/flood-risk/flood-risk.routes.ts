import { Router } from "express";
import { validate } from "../../middleware/validate.middleware";
import { FloodRiskController } from "./flood-risk.controller";
import { atPointSchema, floodRiskAreaSchema, floodRiskImageSchema, liveFloodRiskSchema } from "./flood-risk.validation";

// Mounted at /api/v1/flood-risk. Open to any signed-in user (authMiddleware already ran once in
// app.ts, section 11); the picture route itself hides a map that isn't live from everyone but
// administrators. There are no write routes here: the map only arrives through
// POST /api/v1/imports/flood-risk and is made live by POST /api/v1/imports/:id/promote.
export const floodRiskRouter = Router();

// The fixed paths come before the parameterised ones.
floodRiskRouter.get("/", validate(liveFloodRiskSchema), FloodRiskController.live);
floodRiskRouter.get("/at", validate(atPointSchema), FloodRiskController.at);
floodRiskRouter.get("/layers/:id/image", validate(floodRiskImageSchema), FloodRiskController.image);
floodRiskRouter.get("/areas/:adminUnitId", validate(floodRiskAreaSchema), FloodRiskController.area);

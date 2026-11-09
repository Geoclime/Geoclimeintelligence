import { Router } from "express";
import { validate } from "../../middleware/validate.middleware";
import { SatelliteFloodController } from "./satellite-flood.controller";
import { liveSatelliteFloodSchema, satelliteFloodAreaSchema, satelliteFloodImageSchema } from "./satellite-flood.validation";

// Mounted at /api/v1/satellite-floods. Open to any signed-in user (authMiddleware already ran once
// in app.ts, section 11); the picture route itself hides a month that isn't live from everyone but
// administrators. There are no write routes here: a month only arrives through
// POST /api/v1/imports/satellite-flood and is made live by POST /api/v1/imports/:id/promote.
export const satelliteFloodRouter = Router();

// The fixed paths come before the parameterised ones.
satelliteFloodRouter.get("/", validate(liveSatelliteFloodSchema), SatelliteFloodController.live);
satelliteFloodRouter.get("/layers/:id/image", validate(satelliteFloodImageSchema), SatelliteFloodController.image);
satelliteFloodRouter.get("/areas/:adminUnitId", validate(satelliteFloodAreaSchema), SatelliteFloodController.area);

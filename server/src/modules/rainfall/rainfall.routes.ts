import { Router } from "express";
import { validate } from "../../middleware/validate.middleware";
import { RainfallController } from "./rainfall.controller";
import { getRainfallSchema } from "./rainfall.validation";

// Mounted at /api/v1/rainfall. Open to any signed-in user; authMiddleware already ran once in
// app.ts (section 11). There are no write routes: rainfall only arrives through
// POST /api/v1/imports/:id/promote.
export const rainfallRouter = Router();

rainfallRouter.get("/", validate(getRainfallSchema), RainfallController.series);

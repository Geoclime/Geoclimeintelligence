import { Router } from "express";
import { authorise } from "../../middleware/authorise.middleware";
import { requirePermission } from "../../middleware/require-permission.middleware";
import { validate } from "../../middleware/validate.middleware";
import { AI_ACCESS } from "../ai/ai-access";
import { aiRateLimiter } from "../ai/ai.routes";
import { FloodPredictionController } from "./flood-prediction.controller";
import {
  areaPredictionParamSchema,
  draftAlertSchema,
  generateAiOutlookSchema,
  listPredictionsSchema,
  refreshPredictionsSchema,
  updatePredictionSettingsSchema,
} from "./flood-prediction.validation";

export const floodPredictionRouter = Router();

floodPredictionRouter.get("/", validate(listPredictionsSchema), FloodPredictionController.list);
floodPredictionRouter.get("/settings", FloodPredictionController.getSettings);
floodPredictionRouter.patch(
  "/settings",
  authorise("administrator"),
  validate(updatePredictionSettingsSchema),
  FloodPredictionController.updateSettings,
);
floodPredictionRouter.post(
  "/refresh",
  requirePermission("alerts.issue"),
  validate(refreshPredictionsSchema),
  FloodPredictionController.refresh,
);
floodPredictionRouter.post(
  "/draft-alert",
  requirePermission("alerts.issue"),
  aiRateLimiter,
  validate(draftAlertSchema),
  FloodPredictionController.draftAlert,
);
floodPredictionRouter.get("/areas/:adminUnitId", validate(areaPredictionParamSchema), FloodPredictionController.area);
floodPredictionRouter.post(
  "/areas/:adminUnitId/ai-outlook",
  authorise(...AI_ACCESS.use),
  aiRateLimiter,
  validate(generateAiOutlookSchema),
  FloodPredictionController.generateAiOutlook,
);

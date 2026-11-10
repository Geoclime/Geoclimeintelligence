import { Router } from "express";
import { requirePermission } from "../../middleware/require-permission.middleware";
import { requireCompleteProfile } from "../../middleware/profile.middleware";
import { validate } from "../../middleware/validate.middleware";
import { AlertController } from "./alert.controller";
import { alertIdSchema, createAlertSchema, listAlertsSchema, updateAlertSchema } from "./alert.validation";

// Mounted at /api/v1/alerts. Reading is open to any signed-in user (the active ones are public
// too, at /api/v1/public/alert-map). Issuing, editing, ending and deleting need the alerts.issue
// permission (officials as seeded, and administrators), inside their region scope (checked in the service).
export const alertsRouter = Router();

alertsRouter.get("/", validate(listAlertsSchema), AlertController.list);
alertsRouter.post("/", requirePermission("alerts.issue"), requireCompleteProfile, validate(createAlertSchema), AlertController.create);
alertsRouter.patch("/:id", requirePermission("alerts.issue"), requireCompleteProfile, validate(updateAlertSchema), AlertController.update);
alertsRouter.post("/:id/end", requirePermission("alerts.issue"), validate(alertIdSchema), AlertController.end);
alertsRouter.delete("/:id", requirePermission("alerts.issue"), validate(alertIdSchema), AlertController.remove);

import { Router } from "express";
import { authorise } from "../../middleware/authorise.middleware";
import { requireCompleteProfile } from "../../middleware/profile.middleware";
import { validate } from "../../middleware/validate.middleware";
import { AlertController } from "./alert.controller";
import { alertIdSchema, createAlertSchema, listAlertsSchema, updateAlertSchema } from "./alert.validation";

// Mounted at /api/v1/alerts. Reading is open to any signed-in user (the active ones are public
// too, at /api/v1/public/alert-map). Issuing, editing, ending and deleting are for government
// officials and administrators, inside their region scope (checked in the service).
export const alertsRouter = Router();

alertsRouter.get("/", validate(listAlertsSchema), AlertController.list);
alertsRouter.post("/", authorise("government_official"), requireCompleteProfile, validate(createAlertSchema), AlertController.create);
alertsRouter.patch("/:id", authorise("government_official"), requireCompleteProfile, validate(updateAlertSchema), AlertController.update);
alertsRouter.post("/:id/end", authorise("government_official"), validate(alertIdSchema), AlertController.end);
alertsRouter.delete("/:id", authorise("government_official"), validate(alertIdSchema), AlertController.remove);

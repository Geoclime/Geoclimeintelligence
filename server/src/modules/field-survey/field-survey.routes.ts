import { Router } from "express";
import { authorise } from "../../middleware/authorise.middleware";
import { validate } from "../../middleware/validate.middleware";
import { layerGeoJsonSchema } from "../map-layers/map-layer.validation";
import { DrainageController, FloodExtentController } from "./field-survey.controller";
import { createDrainageSchema, createFloodExtentSchema, drainageSummarySchema, floodHistorySchema, surveyIdSchema, updateDrainageSchema } from "./field-survey.validation";

// Mounted at /api/v1/flood-extents and /api/v1/drainage. Reading is open to any signed-in user (it is
// the map). Recording, re-inspecting and receding are for emergency responders, government officials
// and administrators, inside their region scope (checked in the service); deleting is for whoever
// recorded the thing, or an administrator.

/** GET /geojson?bbox=&zoom=; GET /history?areaId=; POST / (a flood's outline); GET /:id/impact; POST /:id/recede; POST /:id/reopen; DELETE /:id */
export const floodExtentsRouter = Router();
floodExtentsRouter.get("/geojson", validate(layerGeoJsonSchema), FloodExtentController.list);
floodExtentsRouter.get("/history", validate(floodHistorySchema), FloodExtentController.history);
floodExtentsRouter.post("/", authorise("emergency_responder", "government_official"), validate(createFloodExtentSchema), FloodExtentController.create);
floodExtentsRouter.get("/:id/impact", validate(surveyIdSchema), FloodExtentController.impact);
floodExtentsRouter.post("/:id/recede", authorise("emergency_responder", "government_official"), validate(surveyIdSchema), FloodExtentController.recede);
floodExtentsRouter.post("/:id/reopen", authorise("emergency_responder", "government_official"), validate(surveyIdSchema), FloodExtentController.reopen);
floodExtentsRouter.delete("/:id", authorise("emergency_responder", "government_official"), validate(surveyIdSchema), FloodExtentController.remove);

/** GET /geojson?bbox=&zoom=; GET /summary?areaId=; POST / (a drain or its spot); PATCH /:id (an inspection); DELETE /:id */
export const drainageRouter = Router();
drainageRouter.get("/geojson", validate(layerGeoJsonSchema), DrainageController.list);
drainageRouter.get("/summary", validate(drainageSummarySchema), DrainageController.summary);
drainageRouter.post("/", authorise("emergency_responder", "government_official"), validate(createDrainageSchema), DrainageController.create);
drainageRouter.patch("/:id", authorise("emergency_responder", "government_official"), validate(updateDrainageSchema), DrainageController.update);
drainageRouter.delete("/:id", authorise("emergency_responder", "government_official"), validate(surveyIdSchema), DrainageController.remove);

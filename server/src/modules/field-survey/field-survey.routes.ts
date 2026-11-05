import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { AppError, ValidationError } from "../../common/errors/app-error";
import { requirePermission } from "../../middleware/require-permission.middleware";
import { validate } from "../../middleware/validate.middleware";
import { MAX_IMPORT_FILE_BYTES } from "../data-sources/imports/readers/reader-limits";
import { layerGeoJsonSchema } from "../map-layers/map-layer.validation";
import { DrainageController, FloodExtentController } from "./field-survey.controller";
import {
  createDrainageSchema,
  createFloodExtentSchema,
  drainageSummarySchema,
  drainInspectionsSchema,
  floodHistorySchema,
  importDrainageSchema,
  surveyIdSchema,
  updateDrainageSchema,
} from "./field-survey.validation";

// Mounted at /api/v1/flood-extents and /api/v1/drainage. Reading the layers is open to any signed-in
// user (it is the map). Everything else needs a permission (common/access/permissions.ts), which the
// Roles screen sets per role; region scope is checked in the services. Who recorded, inspected or
// called a flood over is for staff with survey.view_people. Deleting needs survey.delete_own (and to be
// the recorder) or survey.delete_any, checked in the service.

const planFile = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1, fields: 10 } }).single("file");

function uploadPlan(req: Request, res: Response, next: NextFunction) {
  planFile(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") return next(new AppError(413, `The file is larger than ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)} MB`));
      return next(new ValidationError([{ field: err.field ?? "file", message: err.message }]));
    }
    next(err);
  });
}

const mayDelete = requirePermission("survey.delete_own", "survey.delete_any");

/** GET /geojson; GET /history; POST /; GET /:id/impact; GET /:id/impact/features; GET /:id/people; POST /:id/recede; POST /:id/reopen; DELETE /:id */
export const floodExtentsRouter = Router();
floodExtentsRouter.get("/geojson", validate(layerGeoJsonSchema), FloodExtentController.list);
floodExtentsRouter.get("/history", validate(floodHistorySchema), FloodExtentController.history);
floodExtentsRouter.post("/", requirePermission("survey.record_flood"), validate(createFloodExtentSchema), FloodExtentController.create);
floodExtentsRouter.get("/:id/impact", validate(surveyIdSchema), FloodExtentController.impact);
floodExtentsRouter.get("/:id/impact/features", validate(surveyIdSchema), FloodExtentController.impactFeatures);
floodExtentsRouter.get("/:id/people", requirePermission("survey.view_people"), validate(surveyIdSchema), FloodExtentController.people);
floodExtentsRouter.post("/:id/recede", requirePermission("survey.recede_flood"), validate(surveyIdSchema), FloodExtentController.recede);
floodExtentsRouter.post("/:id/reopen", requirePermission("survey.recede_flood"), validate(surveyIdSchema), FloodExtentController.reopen);
floodExtentsRouter.delete("/:id", mayDelete, validate(surveyIdSchema), FloodExtentController.remove);

/** GET /geojson; GET /summary; POST /; POST /import; PATCH /:id (an inspection); GET /:id/inspections; GET /:id/people; DELETE /:id */
export const drainageRouter = Router();
drainageRouter.get("/geojson", validate(layerGeoJsonSchema), DrainageController.list);
drainageRouter.get("/summary", validate(drainageSummarySchema), DrainageController.summary);
drainageRouter.post("/", requirePermission("survey.record_drain"), validate(createDrainageSchema), DrainageController.create);
drainageRouter.post("/import", requirePermission("drainage.import"), uploadPlan, validate(importDrainageSchema), DrainageController.importPlan);
drainageRouter.patch("/:id", requirePermission("survey.inspect_drain"), validate(updateDrainageSchema), DrainageController.update);
drainageRouter.get("/:id/inspections", requirePermission("survey.view_people"), validate(drainInspectionsSchema), DrainageController.inspections);
drainageRouter.get("/:id/people", requirePermission("survey.view_people"), validate(surveyIdSchema), DrainageController.people);
drainageRouter.delete("/:id", mayDelete, validate(surveyIdSchema), DrainageController.remove);

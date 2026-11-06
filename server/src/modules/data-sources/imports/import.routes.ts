import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { AppError, ValidationError } from "../../../common/errors/app-error";
import { authorise } from "../../../middleware/authorise.middleware";
import { validate } from "../../../middleware/validate.middleware";
import { FloodRiskController } from "../../flood-risk/flood-risk.controller";
import { floodRiskForRunSchema, startFloodRiskImportSchema } from "../../flood-risk/flood-risk.validation";
import { SatelliteFloodController } from "../../satellite-flood/satellite-flood.controller";
import { satelliteFloodForRunSchema, startSatelliteFloodImportSchema } from "../../satellite-flood/satellite-flood.validation";
import { ImportController } from "./import.controller";
import {
  adminUnitTemplateSchema,
  getImportSchema,
  importGeoJsonSchema,
  listImportsSchema,
  previewImportSchema,
  promoteImportSchema,
  startImportSchema,
  startRainfallImportSchema,
} from "./import.validation";
import { MAX_IMPORT_FILE_BYTES } from "./readers/reader-limits";

// Mounted at /api/v1/imports. Every route is Administrator-only. authMiddleware already ran
// once in app.ts (section 11); only the role check is added here.

// Memory storage only, never local disk (section 14). One file per request.
const singleFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1, fields: 20 },
}).single("file");

/** Runs multer, turning its errors into the platform's envelope errors (413 / 400). */
function uploadFile(req: Request, res: Response, next: NextFunction) {
  singleFile(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(new AppError(413, `The file is larger than ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)} MB`));
      }
      return next(new ValidationError([{ field: err.field ?? "file", message: err.message }]));
    }
    next(err);
  });
}

export const importsRouter = Router();

importsRouter.use(authorise("administrator"));

// The fixed paths come before "/:id".
importsRouter.get("/templates/admin-units", validate(adminUnitTemplateSchema), ImportController.template);
importsRouter.post("/preview", uploadFile, validate(previewImportSchema), ImportController.preview);
importsRouter.get("/", validate(listImportsSchema), ImportController.list);
importsRouter.post("/", uploadFile, validate(startImportSchema), ImportController.start);
importsRouter.post("/rainfall", uploadFile, validate(startRainfallImportSchema), ImportController.startRainfall);
importsRouter.post("/flood-risk", uploadFile, validate(startFloodRiskImportSchema), FloodRiskController.startImport);
importsRouter.post("/satellite-flood", uploadFile, validate(startSatelliteFloodImportSchema), SatelliteFloodController.startImport);
importsRouter.get("/:id", validate(getImportSchema), ImportController.get);
importsRouter.get("/:id/geojson", validate(importGeoJsonSchema), ImportController.geoJson);
importsRouter.get("/:id/flood-risk", validate(floodRiskForRunSchema), FloodRiskController.forRun);
importsRouter.get("/:id/satellite-flood", validate(satelliteFloodForRunSchema), SatelliteFloodController.forRun);
importsRouter.post("/:id/promote", validate(promoteImportSchema), ImportController.promote);

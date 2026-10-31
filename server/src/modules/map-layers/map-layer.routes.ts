import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { AppError, ValidationError } from "../../common/errors/app-error";
import { authorise } from "../../middleware/authorise.middleware";
import { validate } from "../../middleware/validate.middleware";
import { MAX_IMPORT_FILE_BYTES } from "../data-sources/imports/readers/reader-limits";
import { FacilityController } from "./facility.controller";
import { createFacilitySchema, facilityIdSchema, updateFacilitySchema } from "./facility.validation";
import { MapLayerController } from "./map-layer.controller";
import { clearMapLayerSchema, layerGeoJsonSchema, uploadMapLayerSchema } from "./map-layer.validation";

// Mounted at /api/v1/map-layers, /api/v1/roads, /api/v1/waterways, /api/v1/settlements, /api/v1/infrastructure and /api/v1/buildings. Read
// routes are open to any signed-in user; POST /api/v1/map-layers/upload and saving, changing or
// deleting a place by hand on /api/v1/infrastructure are Administrator-only.

const singleFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1, fields: 10 },
}).single("file");

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

/** GET /api/v1/map-layers: each layer, its size and its data sources. POST /upload and /clear: admin only. */
export const mapLayersRouter = Router();
mapLayersRouter.get("/", MapLayerController.list);
mapLayersRouter.post("/upload", authorise("administrator"), uploadFile, validate(uploadMapLayerSchema), MapLayerController.upload);
mapLayersRouter.post("/clear", authorise("administrator"), validate(clearMapLayerSchema), MapLayerController.clear);

/** GET /api/v1/roads/geojson?bbox=...&zoom=... */
export const roadsRouter = Router();
roadsRouter.get("/geojson", validate(layerGeoJsonSchema), MapLayerController.roads);

/** GET /api/v1/waterways/geojson?bbox=...&zoom=... */
export const waterwaysRouter = Router();
waterwaysRouter.get("/geojson", validate(layerGeoJsonSchema), MapLayerController.waterways);

/** GET /api/v1/settlements/geojson?bbox=...&zoom=... */
export const settlementsRouter = Router();
settlementsRouter.get("/geojson", validate(layerGeoJsonSchema), MapLayerController.settlements);

/**
 * GET /api/v1/infrastructure/geojson?bbox=...&zoom=... for any signed-in user. POST / saves a place
 * an import missed, and PATCH and DELETE /:id change or remove one saved that way: Administrator-only.
 */
export const infrastructureRouter = Router();
infrastructureRouter.get("/geojson", validate(layerGeoJsonSchema), MapLayerController.infrastructure);
infrastructureRouter.post("/", authorise("administrator"), validate(createFacilitySchema), FacilityController.create);
infrastructureRouter.patch("/:id", authorise("administrator"), validate(updateFacilitySchema), FacilityController.update);
infrastructureRouter.delete("/:id", authorise("administrator"), validate(facilityIdSchema), FacilityController.remove);

/** GET /api/v1/buildings/geojson?bbox=...&zoom=... (empty below zoom 15) */
export const buildingsRouter = Router();
buildingsRouter.get("/geojson", validate(layerGeoJsonSchema), MapLayerController.buildings);

import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { AppError, ValidationError } from "../../common/errors/app-error";
import { authorise } from "../../middleware/authorise.middleware";
import { validate } from "../../middleware/validate.middleware";
import { MAX_IMPORT_FILE_BYTES } from "../data-sources/imports/readers/reader-limits";
import { MapLayerController } from "./map-layer.controller";
import { clearMapLayerSchema, layerGeoJsonSchema, uploadMapLayerSchema } from "./map-layer.validation";

// Mounted at /api/v1/map-layers, /api/v1/roads, /api/v1/waterways and /api/v1/settlements. Read
// routes are open to any signed-in user; POST /api/v1/map-layers/upload is Administrator-only.

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

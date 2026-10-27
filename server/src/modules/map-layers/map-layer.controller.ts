import type { NextFunction, Request, Response } from "express";
import { ValidationError } from "../../common/errors/app-error";
import { ok } from "../../common/response/api-response";
import { MapLayerLoaderService, type LoadRequest } from "./map-layer-loader.service";
import { MapLayerService } from "./map-layer.service";
import type { ClearMapLayerBody, LayerGeoJsonQueryInput, UploadMapLayerBody } from "./map-layer.validation";

// Casts of req.query / req.body are safe: validate() already replaced them with the parsed, coerced values.

export class MapLayerController {
  static async list(_req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await MapLayerService.Instance.catalog()));
    } catch (err) {
      next(err);
    }
  }

  static async upload(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) throw new ValidationError([{ field: "file", message: "Choose a file to upload" }]);
      const body = req.body as UploadMapLayerBody;
      const fileItem = { fileName: req.file.originalname, buffer: req.file.buffer, sourceId: body.sourceId ?? "" };
      const loadReq: LoadRequest = {
        countryCode: body.countryCode,
        wardLevel: body.wardLevel ?? 3,
        dryRun: false,
        ...(body.layer === "zip" ? { zip: req.file.buffer } : { [body.layer]: fileItem }),
      };
      const report = await MapLayerLoaderService.Instance.load(loadReq);
      const inserted = report.layers.reduce((sum, l) => sum + l.inserted, 0);
      const existing = report.layers.reduce((sum, l) => sum + l.alreadyPresent, 0);
      return res.status(201).json(ok(report, `Loaded ${inserted.toLocaleString("en")} features (${existing.toLocaleString("en")} already present)`));
    } catch (err) {
      next(err);
    }
  }

  static async clear(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as ClearMapLayerBody;
      const report = await MapLayerLoaderService.Instance.clear({
        countryCode: body.countryCode,
        layers: body.layers,
        dryRun: false,
      });
      const total = Object.values(report.deleted).reduce((sum, n) => sum + (n ?? 0), 0);
      return res.json(ok(report, `Cleared ${total.toLocaleString("en")} features`));
    } catch (err) {
      next(err);
    }
  }

  static async roads(req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await MapLayerService.Instance.roadsGeoJson(req.query as unknown as LayerGeoJsonQueryInput)));
    } catch (err) {
      next(err);
    }
  }

  static async waterways(req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await MapLayerService.Instance.waterwaysGeoJson(req.query as unknown as LayerGeoJsonQueryInput)));
    } catch (err) {
      next(err);
    }
  }

  static async settlements(req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await MapLayerService.Instance.settlementsGeoJson(req.query as unknown as LayerGeoJsonQueryInput)));
    } catch (err) {
      next(err);
    }
  }
}

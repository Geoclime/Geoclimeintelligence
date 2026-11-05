import type { NextFunction, Request, Response } from "express";
import { ValidationError } from "../../common/errors/app-error";
import { ok } from "../../common/response/api-response";
import { FloodRiskService } from "./flood-risk.service";
import type { AtPointQuery, LiveFloodRiskQuery, StartFloodRiskImportBody } from "./flood-risk.validation";

// Casts of req.query / req.body are safe: validate() already replaced them with parsed values.

export class FloodRiskController {
  /** POST /imports/flood-risk (administrators): the multipart upload; the service only sees its name and bytes. */
  static async startImport(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) throw new ValidationError([{ field: "file", message: "Choose a GeoTIFF to upload" }]);
      const file = { originalName: req.file.originalname, buffer: req.file.buffer };
      const run = await FloodRiskService.Instance.startImport(file, req.body as StartFloodRiskImportBody, req.user!);
      return res.status(201).json(ok(run, `Measured ${run.rowCount} areas: ${run.passedCount} passed, ${run.errorCount} failed`));
    } catch (err) {
      next(err);
    }
  }

  /** GET /imports/:id/flood-risk (administrators): the map a run staged. */
  static async forRun(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await FloodRiskService.Instance.forRun(req.params.id)));
    } catch (err) {
      next(err);
    }
  }

  /** GET /flood-risk?countryCode=: the live map, or `data: null` when there is none. */
  static async live(req: Request, res: Response, next: NextFunction) {
    try {
      const { countryCode } = req.query as unknown as LiveFloodRiskQuery;
      return res.json(ok(await FloodRiskService.Instance.live(countryCode)));
    } catch (err) {
      next(err);
    }
  }

  /** GET /flood-risk/layers/:id/image: the picture itself, so the body is the file and not the JSON envelope. */
  static async image(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      const png = await FloodRiskService.Instance.image(req.params.id, req.user!);
      // A layer's picture never changes once imported, so the browser may keep it; it is private because the route needs sign-in.
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      res.type("image/png");
      return res.send(png);
    } catch (err) {
      next(err);
    }
  }

  static async area(req: Request<{ adminUnitId: string }>, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await FloodRiskService.Instance.area(req.params.adminUnitId)));
    } catch (err) {
      next(err);
    }
  }

  static async at(req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await FloodRiskService.Instance.at(req.query as unknown as AtPointQuery)));
    } catch (err) {
      next(err);
    }
  }
}

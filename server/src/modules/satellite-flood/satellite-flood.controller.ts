import type { NextFunction, Request, Response } from "express";
import { ValidationError } from "../../common/errors/app-error";
import { ok } from "../../common/response/api-response";
import { SatelliteFloodService } from "./satellite-flood.service";
import type { LiveSatelliteFloodQuery, StartSatelliteFloodImportBody } from "./satellite-flood.validation";

// Casts of req.query / req.body are safe: validate() already replaced them with parsed values.

export class SatelliteFloodController {
  /** POST /imports/satellite-flood (administrators): the multipart upload; the service only sees its name and bytes. */
  static async startImport(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) throw new ValidationError([{ field: "file", message: "Choose an .mbtiles file to upload" }]);
      const file = { originalName: req.file.originalname, buffer: req.file.buffer };
      const run = await SatelliteFloodService.Instance.startImport(file, req.body as StartSatelliteFloodImportBody, req.user!);
      return res.status(201).json(ok(run, `Measured ${run.rowCount} areas: ${run.passedCount} passed, ${run.errorCount} failed`));
    } catch (err) {
      next(err);
    }
  }

  /** GET /imports/:id/satellite-flood (administrators): the month a run staged. */
  static async forRun(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await SatelliteFloodService.Instance.forRun(req.params.id)));
    } catch (err) {
      next(err);
    }
  }

  /** GET /satellite-floods?countryCode=: every live month, newest first. */
  static async live(req: Request, res: Response, next: NextFunction) {
    try {
      const { countryCode } = req.query as unknown as LiveSatelliteFloodQuery;
      return res.json(ok(await SatelliteFloodService.Instance.live(countryCode)));
    } catch (err) {
      next(err);
    }
  }

  /** GET /satellite-floods/layers/:id/image: the picture itself, so the body is the file and not the JSON envelope. */
  static async image(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      const png = await SatelliteFloodService.Instance.image(req.params.id, req.user!);
      // A month's picture never changes once imported (a re-import is a new layer), so the browser may keep it.
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      res.type("image/png");
      return res.send(png);
    } catch (err) {
      next(err);
    }
  }

  static async area(req: Request<{ adminUnitId: string }>, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await SatelliteFloodService.Instance.area(req.params.adminUnitId)));
    } catch (err) {
      next(err);
    }
  }
}

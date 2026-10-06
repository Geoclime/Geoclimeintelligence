import type { NextFunction, Request, Response } from "express";
import { ValidationError } from "../../../common/errors/app-error";
import { ok } from "../../../common/response/api-response";
import { ImportService } from "./import.service";
import type { UploadedFile } from "./import.types";
import type {
  AdminUnitTemplateQuery,
  GetImportQuery,
  ImportGeoJsonQuery,
  ListImportsQuery,
  PreviewImportBody,
  StartImportBody,
} from "./import.validation";

// Casts of req.query / req.body are safe: validate() already replaced them with parsed values.

/** multer leaves the upload on req.file; the service only ever sees its name and bytes. */
function uploadedFile(req: Request): UploadedFile {
  if (!req.file) throw new ValidationError([{ field: "file", message: "Choose a file to upload" }]);
  return { originalName: req.file.originalname, buffer: req.file.buffer };
}

export class ImportController {
  static async preview(req: Request, res: Response, next: NextFunction) {
    try {
      const preview = await ImportService.Instance.preview(uploadedFile(req), req.body as PreviewImportBody);
      return res.json(ok(preview));
    } catch (err) {
      next(err);
    }
  }

  static async start(req: Request, res: Response, next: NextFunction) {
    try {
      const run = await ImportService.Instance.start(uploadedFile(req), req.body as StartImportBody, req.user!);
      return res.status(201).json(ok(run, `Checked ${run.rowCount} rows: ${run.passedCount} passed, ${run.errorCount} failed`));
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { items, meta } = await ImportService.Instance.list(req.query as unknown as ListImportsQuery);
      return res.json(ok(items, "OK", meta));
    } catch (err) {
      next(err);
    }
  }

  static async get(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      const { run, rows, meta } = await ImportService.Instance.get(req.params.id, req.query as unknown as GetImportQuery);
      return res.json(ok({ run, rows }, "OK", meta));
    } catch (err) {
      next(err);
    }
  }

  static async geoJson(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      const { bbox } = req.query as unknown as ImportGeoJsonQuery;
      return res.json(ok(await ImportService.Instance.geoJson(req.params.id, bbox)));
    } catch (err) {
      next(err);
    }
  }

  static async promote(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      const run = await ImportService.Instance.promote(req.params.id, req.user!);
      return res.json(ok(run, `${run.promotedCount ?? 0} areas are now live`));
    } catch (err) {
      next(err);
    }
  }

  /** A file download, so the body is the file itself; errors still use the JSON envelope. */
  static async template(req: Request, res: Response, next: NextFunction) {
    try {
      const file = await ImportService.Instance.template(req.query as unknown as AdminUnitTemplateQuery);
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
      return res.send(file.body);
    } catch (err) {
      next(err);
    }
  }
}

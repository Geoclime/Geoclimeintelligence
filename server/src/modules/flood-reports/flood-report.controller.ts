import type { NextFunction, Request, Response } from "express";
import { ok } from "../../common/response/api-response";
import { FloodReportService, type ReportFiles } from "./flood-report.service";
import type { CreateReportBody, ListReportsQuery, MyReportsQuery, ReviewReportBody } from "./flood-report.validation";

// Casts of req.query / req.body are safe: validate() already replaced them with the parsed values.

type MediaParams = { id: string; mediaId: string };

export class FloodReportController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const files = (req.files ?? {}) as ReportFiles;
      const report = await FloodReportService.Instance.submit(req.user!, req.body as CreateReportBody, files);
      return res.status(201).json(ok(report, "Report received. A coordinator will review it before it is published."));
    } catch (err) {
      next(err);
    }
  }

  static async mine(req: Request, res: Response, next: NextFunction) {
    try {
      const { items, meta } = await FloodReportService.Instance.mine(req.user!, req.query as unknown as MyReportsQuery);
      return res.json(ok(items, "OK", meta));
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { items, meta } = await FloodReportService.Instance.list(req.user!, req.query as unknown as ListReportsQuery);
      return res.json(ok(items, "OK", meta));
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await FloodReportService.Instance.get(req.params.id, req.user!)));
    } catch (err) {
      next(err);
    }
  }

  static async review(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      const body = req.body as ReviewReportBody;
      const report = await FloodReportService.Instance.review(req.params.id, req.user!, body);
      return res.json(ok(report, body.decision === "publish" ? "Report published" : "Report rejected"));
    } catch (err) {
      next(err);
    }
  }

  /** What the report form may offer: which kinds of media, and their limits. */
  static options(_req: Request, res: Response) {
    return res.json(ok(FloodReportService.Instance.options()));
  }

  /**
   * The file itself, not the envelope. One kept in the database is sent from here; one in
   * Cloudinary is a redirect to a signed link (only after the same visibility check).
   */
  static async media(req: Request<MediaParams>, res: Response, next: NextFunction) {
    try {
      const file = await FloodReportService.Instance.media(req.params.id, req.params.mediaId, req.user!);
      if ("redirect" in file) return res.set("Cache-Control", "private, no-store").redirect(302, file.redirect);
      res.set({ "Content-Type": file.mimeType, "Content-Disposition": "inline", "Cache-Control": "private, max-age=3600" });
      return res.send(file.data);
    } catch (err) {
      next(err);
    }
  }
}

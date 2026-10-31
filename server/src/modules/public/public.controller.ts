import type { NextFunction, Request, Response } from "express";
import { ok } from "../../common/response/api-response";
import { PublicService } from "./public.service";
import type { PublicLocateQuery, PublicSearchQuery } from "./public.validation";

// Casts of req.query are safe: validate() already replaced it with the parsed, coerced values.

/** Browsers and CDNs may reuse a public reply this long: the service caches the same data for 5 minutes. */
const SHARED_CACHE = "public, max-age=300";
/** Search and locate answers depend on the question, so they are reused for less time. */
const SHORT_CACHE = "public, max-age=60";
/**
 * The alert map is the one public reply that can't be a minute old: a severe alert has to reach
 * the landing page at once. "no-cache" lets browsers and proxies keep a copy but ask before using
 * it, and the ETag makes that check a cheap 304 when nothing changed.
 */
const REVALIDATE = "public, no-cache";

export class PublicController {
  static async overview(_req: Request, res: Response, next: NextFunction) {
    try {
      const overview = await PublicService.Instance.overview();
      return res.set("Cache-Control", SHARED_CACHE).json(ok(overview));
    } catch (err) {
      next(err);
    }
  }

  static async outline(_req: Request, res: Response, next: NextFunction) {
    try {
      const outline = await PublicService.Instance.outline();
      return res.set("Cache-Control", SHARED_CACHE).json(ok(outline));
    } catch (err) {
      next(err);
    }
  }

  static async alertMap(_req: Request, res: Response, next: NextFunction) {
    try {
      const map = await PublicService.Instance.alertMap();
      return res.set("Cache-Control", REVALIDATE).json(ok(map));
    } catch (err) {
      next(err);
    }
  }

  static async search(req: Request, res: Response, next: NextFunction) {
    try {
      const results = await PublicService.Instance.search(req.query as unknown as PublicSearchQuery);
      return res.set("Cache-Control", SHORT_CACHE).json(ok(results));
    } catch (err) {
      next(err);
    }
  }

  static async area(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      const area = await PublicService.Instance.area(req.params.id);
      return res.set("Cache-Control", SHARED_CACHE).json(ok(area));
    } catch (err) {
      next(err);
    }
  }

  static async locate(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await PublicService.Instance.locate(req.query as unknown as PublicLocateQuery);
      return res.set("Cache-Control", SHORT_CACHE).json(ok(result));
    } catch (err) {
      next(err);
    }
  }
}

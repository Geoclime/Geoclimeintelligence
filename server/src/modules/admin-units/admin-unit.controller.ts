import type { NextFunction, Request, Response } from "express";
import { ok } from "../../common/response/api-response";
import { AdminUnitService } from "./admin-unit.service";
import type { AdminUnitGeoJsonQuery, ListAdminUnitsQuery, ListChildrenQuery, LocateQuery } from "./admin-unit.validation";

// Casts of req.query are safe: validate() already replaced it with the parsed, coerced values.

export class AdminUnitController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { items, meta } = await AdminUnitService.Instance.list(req.query as unknown as ListAdminUnitsQuery);
      return res.json(ok(items, "OK", meta));
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await AdminUnitService.Instance.getById(req.params.id)));
    } catch (err) {
      next(err);
    }
  }

  static async children(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      const { items, meta } = await AdminUnitService.Instance.children(
        req.params.id,
        req.query as unknown as ListChildrenQuery,
      );
      return res.json(ok(items, "OK", meta));
    } catch (err) {
      next(err);
    }
  }

  static async geoJson(req: Request, res: Response, next: NextFunction) {
    try {
      const collection = await AdminUnitService.Instance.geoJson(req.query as unknown as AdminUnitGeoJsonQuery);
      return res.json(ok(collection));
    } catch (err) {
      next(err);
    }
  }

  static async locate(req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await AdminUnitService.Instance.locate(req.query as unknown as LocateQuery)));
    } catch (err) {
      next(err);
    }
  }
}

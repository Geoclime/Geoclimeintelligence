import type { NextFunction, Request, Response } from "express";
import { ok } from "../../common/response/api-response";
import { DataSourceService } from "./data-source.service";
import type { CreateDataSourceBody, ListDataSourcesQuery } from "./data-source.validation";

// Casts of req.query / req.body are safe: validate() already replaced them with parsed values.

export class DataSourceController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { items, meta } = await DataSourceService.Instance.list(req.query as unknown as ListDataSourcesQuery);
      return res.json(ok(items, "OK", meta));
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const source = await DataSourceService.Instance.create(req.body as CreateDataSourceBody, req.user!);
      return res.status(201).json(ok(source, "Data source added"));
    } catch (err) {
      next(err);
    }
  }
}

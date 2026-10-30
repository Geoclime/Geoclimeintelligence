import type { NextFunction, Request, Response } from "express";
import { ok } from "../../common/response/api-response";
import { AlertService } from "./alert.service";
import type { CreateAlertBody, ListAlertsQuery } from "./alert.validation";

// Casts of req.query / req.body are safe: validate() already replaced them with the parsed values.

export class AlertController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await AlertService.Instance.list(req.query as unknown as ListAlertsQuery)));
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const alert = await AlertService.Instance.create(req.body as CreateAlertBody, req.user!);
      return res.status(201).json(ok(alert, "Alert issued"));
    } catch (err) {
      next(err);
    }
  }

  static async end(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await AlertService.Instance.end(req.params.id, req.user!), "Alert ended"));
    } catch (err) {
      next(err);
    }
  }
}

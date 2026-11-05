import type { NextFunction, Request, Response } from "express";
import { ok } from "../../common/response/api-response";
import { RainfallService } from "./rainfall.service";
import type { GetRainfallQuery } from "./rainfall.validation";

// The cast of req.query is safe: validate() already replaced it with the parsed values.

export class RainfallController {
  static async series(req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await RainfallService.Instance.series(req.query as unknown as GetRainfallQuery)));
    } catch (err) {
      next(err);
    }
  }
}

import type { NextFunction, Request, Response } from "express";
import { ok } from "../../common/response/api-response";
import { FacilityService } from "./facility.service";
import type { CreateFacilityBody, UpdateFacilityBody } from "./facility.validation";

// Casts of req.body are safe: validate() already replaced it with the parsed values.

export class FacilityController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const place = await FacilityService.Instance.create(req.body as CreateFacilityBody, req.user!);
      return res.status(201).json(ok(place, "Place saved"));
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await FacilityService.Instance.update(req.params.id, req.body as UpdateFacilityBody), "Place updated"));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      await FacilityService.Instance.remove(req.params.id);
      return res.json(ok(null, "Place deleted"));
    } catch (err) {
      next(err);
    }
  }
}

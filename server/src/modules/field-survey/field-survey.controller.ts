import type { NextFunction, Request, Response } from "express";
import { ok } from "../../common/response/api-response";
import type { LayerGeoJsonQueryInput } from "../map-layers/map-layer.validation";
import { DrainageService } from "./drainage.service";
import { ValidationError } from "../../common/errors/app-error";
import type { CreateDrainageBody, CreateFloodExtentBody, FloodHistoryQuery, ImportDrainageBody, UpdateDrainageBody } from "./field-survey.validation";
import { FloodExtentService } from "./flood-extent.service";

// Casts of req.body / req.query are safe: validate() already replaced them with the parsed values.

export class FloodExtentController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await FloodExtentService.Instance.list(req.query as unknown as LayerGeoJsonQueryInput)));
    } catch (err) {
      next(err);
    }
  }

  static async history(req: Request, res: Response, next: NextFunction) {
    try {
      const { areaId, limit } = req.query as unknown as FloodHistoryQuery;
      return res.json(ok(await FloodExtentService.Instance.history(areaId, limit)));
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      return res.status(201).json(ok(await FloodExtentService.Instance.create(req.body as CreateFloodExtentBody, req.user!), "Flood extent saved"));
    } catch (err) {
      next(err);
    }
  }

  static async impact(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await FloodExtentService.Instance.impact(req.params.id)));
    } catch (err) {
      next(err);
    }
  }

  static async impactFeatures(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await FloodExtentService.Instance.impactFeatures(req.params.id)));
    } catch (err) {
      next(err);
    }
  }

  static async people(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await FloodExtentService.Instance.people(req.params.id)));
    } catch (err) {
      next(err);
    }
  }

  static async recede(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await FloodExtentService.Instance.recede(req.params.id, req.user!), "Marked as receded"));
    } catch (err) {
      next(err);
    }
  }

  static async reopen(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await FloodExtentService.Instance.reopen(req.params.id, req.user!), "Marked as active again"));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      await FloodExtentService.Instance.remove(req.params.id, req.user!);
      return res.json(ok(null, "Flood extent deleted"));
    } catch (err) {
      next(err);
    }
  }
}

export class DrainageController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await DrainageService.Instance.list(req.query as unknown as LayerGeoJsonQueryInput)));
    } catch (err) {
      next(err);
    }
  }

  static async summary(req: Request, res: Response, next: NextFunction) {
    try {
      const { areaId, limit } = req.query as unknown as FloodHistoryQuery;
      return res.json(ok(await DrainageService.Instance.summary(areaId, limit)));
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      return res.status(201).json(ok(await DrainageService.Instance.create(req.body as CreateDrainageBody, req.user!), "Drainage saved"));
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await DrainageService.Instance.update(req.params.id, req.body as UpdateDrainageBody, req.user!), "Drainage updated"));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      await DrainageService.Instance.remove(req.params.id, req.user!);
      return res.json(ok(null, "Drainage deleted"));
    } catch (err) {
      next(err);
    }
  }

  static async inspections(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      const { limit } = req.query as unknown as { limit: number };
      return res.json(ok(await DrainageService.Instance.inspections(req.params.id, limit)));
    } catch (err) {
      next(err);
    }
  }

  static async people(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await DrainageService.Instance.people(req.params.id)));
    } catch (err) {
      next(err);
    }
  }

  static async importPlan(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) throw new ValidationError([{ field: "file", message: "Choose the drainage plan (a .geojson file) to upload" }]);
      const body = req.body as ImportDrainageBody;
      const report = await DrainageService.Instance.importPlan(
        { fileName: req.file.originalname, buffer: req.file.buffer },
        { countryCode: body.countryCode, wardLevel: body.wardLevel, planDate: body.planDate },
        req.user!,
      );
      return res.status(201).json(ok(report, `Imported ${report.inserted.toLocaleString("en")} drains (${report.alreadyPresent.toLocaleString("en")} already there)`));
    } catch (err) {
      next(err);
    }
  }
}

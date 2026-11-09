import type { NextFunction, Request, Response } from "express";
import { ok } from "../../common/response/api-response";
import { FloodPredictionService } from "./flood-prediction.service";
import type {
  AreaPredictionQuery,
  DraftAlertBody,
  GenerateAiOutlookBody,
  ListPredictionsQuery,
  RefreshPredictionsBody,
  UpdatePredictionSettingsBody,
} from "./flood-prediction.validation";

export class FloodPredictionController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { countryCode, days } = req.query as unknown as ListPredictionsQuery;
      const items = await FloodPredictionService.Instance.list(countryCode, days);
      return res.json(ok(items));
    } catch (err) {
      next(err);
    }
  }

  static async area(req: Request<{ adminUnitId: string }>, res: Response, next: NextFunction) {
    try {
      const { days } = req.query as unknown as AreaPredictionQuery;
      const outlook = await FloodPredictionService.Instance.area(req.params.adminUnitId, days);
      return res.json(ok(outlook));
    } catch (err) {
      next(err);
    }
  }

  static async generateAiOutlook(
    req: Request<{ adminUnitId: string }, unknown, GenerateAiOutlookBody>,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const updated = await FloodPredictionService.Instance.generateAiOutlook(
        req.params.adminUnitId,
        req.body.days,
        req.user!,
      );
      return res.json(ok(updated));
    } catch (err) {
      next(err);
    }
  }

  static async refresh(req: Request<unknown, unknown, RefreshPredictionsBody>, res: Response, next: NextFunction) {
    try {
      const items = await FloodPredictionService.Instance.refreshCountry(req.body.countryCode, req.user!);
      return res.json(ok(items));
    } catch (err) {
      next(err);
    }
  }

  static async draftAlert(req: Request<unknown, unknown, DraftAlertBody>, res: Response, next: NextFunction) {
    try {
      const draft = await FloodPredictionService.Instance.draftAlert(req.body.areaIds, req.user!);
      return res.json(ok(draft));
    } catch (err) {
      next(err);
    }
  }

  static async getSettings(_req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await FloodPredictionService.Instance.getSettings();
      return res.json(ok(settings));
    } catch (err) {
      next(err);
    }
  }

  static async updateSettings(
    req: Request<unknown, unknown, UpdatePredictionSettingsBody>,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const settings = await FloodPredictionService.Instance.updateSettings(req.body, req.user!);
      return res.json(ok(settings));
    } catch (err) {
      next(err);
    }
  }
}

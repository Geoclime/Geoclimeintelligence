import type { NextFunction, Request, Response } from "express";
import { ok } from "../../common/response/api-response";
import { CountryService } from "./country.service";
import type { CreateCountryBody, UpdateCountryBody } from "./country.validation";

// Casts of req.params / req.body are safe: validate() already replaced them with parsed values
// (the code param is upper-cased there, so "nga" and "NGA" reach the service the same).

export class CountryController {
  static async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const countries = await CountryService.Instance.list();
      return res.json(ok(countries, "OK", { total: countries.length }));
    } catch (err) {
      next(err);
    }
  }

  static async get(req: Request<{ code: string }>, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await CountryService.Instance.get(req.params.code)));
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const country = await CountryService.Instance.create(req.body as CreateCountryBody);
      return res.status(201).json(ok(country, "Country created"));
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request<{ code: string }>, res: Response, next: NextFunction) {
    try {
      const country = await CountryService.Instance.update(req.params.code, req.body as UpdateCountryBody);
      return res.json(ok(country, "Country updated"));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req: Request<{ code: string }>, res: Response, next: NextFunction) {
    try {
      await CountryService.Instance.delete(req.params.code);
      return res.json(ok(null, "Country deleted"));
    } catch (err) {
      next(err);
    }
  }
}

import type { NextFunction, Request, Response } from "express";
import { ok } from "../../common/response/api-response";
import { UserService } from "./user.service";
import type { ListUsersQuery, UpdateUserAccessBody } from "./user.validation";

// Casts of req.query / req.body below are safe: validate() has already replaced them with
// the parsed output of this route's Zod schema before the controller runs.

export class UserController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { items, meta } = await UserService.Instance.list(req.query as unknown as ListUsersQuery);
      return res.json(ok(items, "OK", meta));
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      const user = await UserService.Instance.getById(req.params.id);
      return res.json(ok(user));
    } catch (err) {
      next(err);
    }
  }

  static async updateAccess(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      const user = await UserService.Instance.updateAccess(
        req.params.id,
        req.body as UpdateUserAccessBody,
        req.user!,
      );
      return res.json(ok(user, "User access updated"));
    } catch (err) {
      next(err);
    }
  }
}

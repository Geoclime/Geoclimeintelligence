import type { NextFunction, Request, Response } from "express";
import { ok } from "../../common/response/api-response";

export class AuthController {
  /**
   * The backend's view of the signed-in user. Sign-up, sign-in and password reset happen in
   * the client via the Firebase Auth SDK; calling this once afterwards is what creates the
   * user's row here (resolveUserMiddleware already did that by the time we get here).
   */
  static async me(req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(ok(req.user!));
    } catch (err) {
      next(err);
    }
  }
}

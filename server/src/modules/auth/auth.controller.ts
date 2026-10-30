import type { NextFunction, Request, Response } from "express";
import { ok } from "../../common/response/api-response";
import { AuthService } from "./auth.service";
import type { RoleRequestBody, UpdateProfileBody } from "./auth.validation";

export class AuthController {
  /**
   * The backend's view of the signed-in user. Sign-up, sign-in and password reset happen in
   * the client via the Firebase Auth SDK; calling this once afterwards is what creates the
   * user's row here (resolveUserMiddleware already did that by the time we get here).
   */
  static async me(req: Request, res: Response, next: NextFunction) {
    try {
      // The full profile (AuthUser plus contact details and dates), not just req.user.
      return res.json(ok(await AuthService.Instance.getProfile(req.user!)));
    } catch (err) {
      next(err);
    }
  }

  static async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const profile = await AuthService.Instance.updateProfile(req.user!, req.body as UpdateProfileBody);
      return res.json(ok(profile, "Profile updated"));
    } catch (err) {
      next(err);
    }
  }

  static async requestRole(req: Request, res: Response, next: NextFunction) {
    try {
      const profile = await AuthService.Instance.requestRole(req.user!, req.body as RoleRequestBody);
      return res.json(ok(profile, "Role request sent to the administrators"));
    } catch (err) {
      next(err);
    }
  }

  static async withdrawRoleRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const profile = await AuthService.Instance.withdrawRoleRequest(req.user!);
      return res.json(ok(profile, "Role request withdrawn"));
    } catch (err) {
      next(err);
    }
  }
}

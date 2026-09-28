import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "../common/access/roles";
import { ForbiddenError, UnauthorizedError } from "../common/errors/app-error";

/**
 * Route-level role check (section 7): the cheap half of access control, run before the
 * controller. Administrators have full read/write, so they always pass. The region half
 * (assertRegionAccess / applyRegionScope) runs later, in the service.
 */
export function authorise(...allowed: [UserRole, ...UserRole[]]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();
    if (req.user.role !== "administrator" && !allowed.includes(req.user.role)) {
      throw new ForbiddenError("Your role is not permitted to perform this action");
    }
    next();
  };
}

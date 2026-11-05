import type { NextFunction, Request, Response } from "express";
import { PermissionResolver } from "../common/access/permission-resolver";
import type { Permission } from "../common/access/permissions";
import { ForbiddenError, UnauthorizedError } from "../common/errors/app-error";

/**
 * Route-level permission check: the caller's role must hold at least one of `permissions`
 * (common/access/permissions.ts). Administrators always pass. Like authorise(), it runs before the
 * controller; region scope and "is this yours?" are checked later, in the service.
 */
export function requirePermission(...permissions: [Permission, ...Permission[]]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    PermissionResolver.Instance.hasAny(req.user, permissions).then(
      (allowed) => next(allowed ? undefined : new ForbiddenError("Your role is not permitted to perform this action")),
      next,
    );
  };
}

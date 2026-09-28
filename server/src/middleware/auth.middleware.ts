import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../common/errors/app-error";
import { AuthService } from "../modules/auth/auth.service";

// Both middlewares are mounted exactly once, in app.ts, for everything under /api/v1
// (section 11). Express 5 forwards errors thrown in async middleware to errorHandler.

/** Verifies the Firebase ID token in `Authorization: Bearer <token>` and sets req.firebaseUser. */
export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) throw new UnauthorizedError("Missing bearer token");

  req.firebaseUser = await AuthService.Instance.verifyToken(token);
  next();
}

/** Looks up (or, on first sight, creates) our users row for the Firebase identity; sets req.user. */
export async function resolveUserMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (!req.firebaseUser) throw new UnauthorizedError();

  req.user = await AuthService.Instance.resolveUser(req.firebaseUser);
  next();
}

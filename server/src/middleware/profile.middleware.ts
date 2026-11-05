import type { NextFunction, Request, Response } from "express";
import { AppError, UnauthorizedError } from "../common/errors/app-error";

/**
 * Some actions need to know who is acting and how to reach them: sending a flood report, asking
 * for a role, issuing an alert. They need a complete profile (name, phone number and home area);
 * the web app asks for these straight after the first sign-in, so only a direct API caller
 * would ever meet this. 403 with a code the client can recognise.
 */
export function requireCompleteProfile(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new UnauthorizedError();
  if (!req.user.profileComplete) {
    throw new AppError(403, "Finish setting up your profile first: add your full name, phone number and home area.");
  }
  next();
}

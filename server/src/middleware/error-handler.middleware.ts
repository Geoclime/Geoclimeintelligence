import type { NextFunction, Request, Response } from "express";
import { AppError } from "../common/errors/app-error";
import { isDatabaseUnreachable, unreachableHost, unreachableReason } from "../common/errors/database-unreachable";
import { fail } from "../common/response/api-response";
import { logger } from "../config/logger";

/** Catches requests that matched no route. Mounted after every router. */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json(fail(`Route ${req.method} ${req.path} not found`));
}

/**
 * The single global error handler, mounted last (section 5). Known AppErrors map to their
 * own status; a service the server needs that can't be reached (the database host not resolving, a dropped
 * connection) is a 503, logged as a warning, which the web app retries for reads; anything else is logged in
 * full and returned as a generic 500 -- stack traces and internals never reach the client.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error({ err, ...requestContext(req) }, err.message);
    return res.status(err.statusCode).json(fail(err.message, err.errors));
  }

  const bodyStatus = bodyParserStatus(err);
  if (bodyStatus) {
    return res
      .status(bodyStatus)
      .json(fail(bodyStatus === 413 ? "Request body too large" : "Malformed request body"));
  }

  if (isDatabaseUnreachable(err)) {
    logger.warn({ reason: unreachableReason(err), host: unreachableHost(err), ...requestContext(req) }, "A service the server needs couldn't be reached");
    res.setHeader("Retry-After", "5");
    return res.status(503).json(fail("The server can't reach a service it depends on, such as the database, right now. Please try again in a moment."));
  }

  logger.error({ err, ...requestContext(req) }, "Unhandled error");
  return res.status(500).json(fail("Something went wrong"));
}

function requestContext(req: Request) {
  return { method: req.method, path: req.originalUrl, userId: req.user?.id };
}

/** express.json() rejects bad bodies with an http-error carrying a 4xx status and a `type`. */
function bodyParserStatus(err: unknown): number | undefined {
  const candidate = err as { status?: unknown; type?: unknown } | null;
  if (typeof candidate?.type !== "string" || !candidate.type.startsWith("entity.")) return undefined;
  return typeof candidate.status === "number" && candidate.status >= 400 && candidate.status < 500
    ? candidate.status
    : undefined;
}

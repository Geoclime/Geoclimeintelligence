import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import { ValidationError } from "../common/errors/app-error";

type RequestParts = { body?: unknown; query?: unknown; params?: unknown };

/**
 * Validates req.body / req.query / req.params against a route's Zod schema (section 4) and
 * replaces them with the parsed values, so defaults and coercions reach the controller.
 */
export function validate(schema: z.ZodType<RequestParts>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });
    if (!result.success) {
      throw new ValidationError(
        result.error.issues.map((issue) => ({
          // Drop the leading "body"/"query"/"params" segment unless it is all there is.
          field: (issue.path.length > 1 ? issue.path.slice(1) : issue.path).join("."),
          message: issue.message,
        })),
      );
    }

    const { body, query, params } = result.data;
    if (body !== undefined) req.body = body;
    if (params !== undefined) req.params = params as Request["params"];
    // Express 5 exposes req.query as a getter only, so it is redefined rather than assigned.
    if (query !== undefined) Object.defineProperty(req, "query", { value: query, writable: true, configurable: true });
    next();
  };
}

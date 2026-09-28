import { z } from "zod";
import { ValidationError } from "../errors/app-error";

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

/** `?page=2&pageSize=25` -- for admin screens and small, stable lists (section 10). */
export const offsetPageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type OffsetPageQuery = z.infer<typeof offsetPageQuerySchema>;

/** `?cursor=<opaque>&limit=25` -- for large or frequently-written lists (section 10). */
export const cursorPageQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type CursorPageQuery = z.infer<typeof cursorPageQuerySchema>;

/** Where the previous page ended: the ordering column's value, plus the id as a tie-breaker. */
export interface CursorPosition {
  value: string | number;
  id: string;
}

const cursorPositionSchema = z.object({
  value: z.union([z.string(), z.number()]),
  id: z.string().min(1),
});

export function encodeCursor(position: CursorPosition): string {
  return Buffer.from(JSON.stringify(position), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): CursorPosition {
  try {
    return cursorPositionSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    throw new ValidationError([{ field: "cursor", message: "Invalid pagination cursor" }]);
  }
}

import type { PaginationMeta } from "../types/api.types";

/**
 * Derives what the backend's meta doesn't send (standard section 4), in one place, so no
 * component ever reads a totalPages / hasNext field that is always undefined.
 */
export function paginationDetails(meta: PaginationMeta | undefined) {
  const { page = 1, pageSize = 20, total = 0 } = meta ?? {};
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  return { page, pageSize, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

/** Reads a positive page number from a query-string value, falling back to 1 for junk input. */
export function parsePageParam(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

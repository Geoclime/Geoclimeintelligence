/**
 * Mirrors the backend envelope exactly: server/src/common/response/api-response.ts.
 * If one changes, both change in the same PR (standard section 4).
 */
export interface ApiResponse<T = null> {
  success: boolean;
  data: T | null;
  message: string;
  errors?: ValidationError[];
  meta?: PaginationMeta;
}

/**
 * The only fields the server sends. totalPages / hasNext / hasPrev are derived client-side by
 * paginationDetails() in utils/pagination.ts, never expected over the wire.
 */
export interface PaginationMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  nextCursor?: string;
}

/** Matches the backend's FieldError: `field` is the request field that failed, when known. */
export interface ValidationError {
  field?: string;
  message: string;
}

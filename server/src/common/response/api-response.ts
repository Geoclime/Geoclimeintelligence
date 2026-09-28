import type { FieldError } from "../errors/app-error";

export interface PageMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  nextCursor?: string;
}

/** The one response shape every endpoint returns (section 5). */
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message: string;
  errors?: FieldError[];
  meta?: PageMeta;
}

export function ok<T>(data: T, message = "OK", meta?: PageMeta): ApiResponse<T> {
  return meta ? { success: true, data, message, meta } : { success: true, data, message };
}

export function fail(message: string, errors?: FieldError[]): ApiResponse<null> {
  return errors?.length ? { success: false, data: null, message, errors } : { success: false, data: null, message };
}

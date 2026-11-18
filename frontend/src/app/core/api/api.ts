import { HttpErrorResponse } from '@angular/common/http';

/** All backend calls go through the same-origin `/api/v1` prefix (proxied to Express in development). */
export const API_BASE_URL = '/api/v1';

/** Error body returned by every backend endpoint. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

/** A field-level validation problem reported by the API (`error.details[]` on 422). */
export interface FieldIssue {
  path: string;
  message: string;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  requestId?: string;
  details?: unknown;
  fieldErrors: FieldIssue[];
}

/** Standard list response returned by paginated endpoints. */
export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

function toFieldIssues(details: unknown): FieldIssue[] {
  if (!Array.isArray(details)) return [];
  return details.filter(
    (d): d is FieldIssue =>
      typeof d === 'object' &&
      d !== null &&
      typeof (d as FieldIssue).path === 'string' &&
      typeof (d as FieldIssue).message === 'string',
  );
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const err = (value as { error: unknown }).error;
  return typeof err === 'object' && err !== null && 'message' in err && 'code' in err;
}

/** Converts any HTTP failure into a user-presentable error. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return {
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'Cannot reach the server. Check your connection and try again.',
        fieldErrors: [],
      };
    }
    if (isApiErrorBody(error.error)) {
      return {
        status: error.status,
        code: error.error.error.code,
        message: error.error.error.message,
        requestId: error.error.error.requestId,
        details: (error.error.error as { details?: unknown }).details,
        fieldErrors: toFieldIssues(error.error.error.details),
      };
    }
    if (error.status >= 500) {
      return {
        status: error.status,
        code: 'SERVER_ERROR',
        message: 'The server could not complete the request. Please try again.',
        fieldErrors: [],
      };
    }
    return { status: error.status, code: 'HTTP_ERROR', message: error.message, fieldErrors: [] };
  }
  return {
    status: -1,
    code: 'UNKNOWN',
    message: 'Something went wrong. Please try again.',
    fieldErrors: [],
  };
}

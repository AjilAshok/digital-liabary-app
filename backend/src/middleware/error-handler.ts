import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, Errors } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { requestIdOf } from '../lib/request-context.js';

/** Consistent JSON error body. Internal details/stack traces are never sent to clients. */
export interface ErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(Errors.notFound(`Route ${req.method} ${req.path} not found`));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  let appError: AppError;

  if (err instanceof AppError) {
    appError = err;
  } else if (isBodyParserError(err)) {
    appError =
      err.type === 'entity.too.large'
        ? new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large')
        : Errors.badRequest('Malformed request body');
  } else if (isMulterError(err)) {
    appError =
      err.code === 'LIMIT_FILE_SIZE'
        ? new AppError(413, 'PAYLOAD_TOO_LARGE', 'The uploaded file is too large')
        : Errors.badRequest('Invalid file upload');
  } else if (isPrismaKnownError(err) && err.code === 'P2002') {
    // Unique constraint lost to a concurrent request (services pre-check the common cases).
    appError = new AppError(409, 'CONFLICT', 'A record with the same unique value already exists', {
      fields: err.meta?.['target'] ?? null,
    });
  } else if (isPrismaKnownError(err) && err.code === 'P2025') {
    appError = Errors.notFound();
  } else {
    logger.error({ err, requestId: req.id }, 'Unhandled error');
    appError = new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }

  if (appError.status >= 500 && err instanceof AppError) {
    logger.error({ err, requestId: req.id }, appError.message);
  }

  const body: ErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
      ...(requestIdOf(req) ? { requestId: requestIdOf(req) } : {}),
    },
  };
  res.status(appError.status).json(body);
};

function isMulterError(err: unknown): err is { name: 'MulterError'; code: string } {
  return (
    typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'MulterError'
  );
}

function isPrismaKnownError(err: unknown): err is { code: string; meta?: Record<string, unknown> } {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { code?: unknown }).code === 'string' &&
    /^P\d{4}$/.test((err as { code: string }).code)
  );
}

function isBodyParserError(err: unknown): err is { type: string; status: number } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    typeof err.type === 'string' &&
    'status' in err
  );
}

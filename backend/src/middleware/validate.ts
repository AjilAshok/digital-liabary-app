import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { Errors } from '../lib/errors.js';

function formatIssues(error: z.ZodError) {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code }));
}

/** Validates and replaces `req.body` with the parsed (typed, stripped) value. */
export function validateBody<T extends z.ZodType>(schema: T): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) return next(Errors.validation(formatIssues(result.error)));
    req.body = result.data;
    next();
  };
}

/** Validates the query string; parsed value is stored in `res.locals.query` (Express 5 req.query is read-only). */
export function validateQuery<T extends z.ZodType>(schema: T): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(Errors.validation(formatIssues(result.error)));
    res.locals['query'] = result.data;
    next();
  };
}

/** Validates route params; parsed value is stored in `res.locals.params`. */
export function validateParams<T extends z.ZodType>(schema: T): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) return next(Errors.validation(formatIssues(result.error)));
    res.locals['params'] = result.data;
    next();
  };
}

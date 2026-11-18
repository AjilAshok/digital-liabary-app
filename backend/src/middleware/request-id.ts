import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Accepts a well-formed inbound X-Request-Id (from a proxy) or generates one. */
export const requestId: RequestHandler = (req, res, next) => {
  const inbound = req.header('x-request-id');
  req.id = inbound && SAFE_ID.test(inbound) ? inbound : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};

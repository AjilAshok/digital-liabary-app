import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { getEnv } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { authenticate, optionalAuthenticate } from '../../middleware/authenticate.js';
import { paginationQuerySchema } from '../../lib/pagination.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import * as controller from './auth.controller.js';
import { loginSchema } from './auth.schemas.js';
import { changePasswordSchema, updateProfileSchema } from './profile.schemas.js';

export function authRouter(): Router {
  const env = getEnv();
  const router = Router();

  const loginLimiter = rateLimit({
    windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60_000,
    limit: env.LOGIN_RATE_LIMIT_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(
        new AppError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Please wait and try again.'),
      ),
  });

  router.post('/login', loginLimiter, validateBody(loginSchema), controller.login);
  router.post('/logout', optionalAuthenticate, controller.logout);
  router.post('/logout-all', authenticate, controller.logoutAll);
  router.get('/me', authenticate, controller.me);
  router.patch('/me', authenticate, validateBody(updateProfileSchema), controller.updateMe);
  router.get(
    '/me/activity',
    authenticate,
    validateQuery(paginationQuerySchema),
    controller.myActivity,
  );
  // Shares the login limiter: password verification is a guessing target too.
  router.post(
    '/change-password',
    loginLimiter,
    authenticate,
    validateBody(changePasswordSchema),
    controller.changePassword,
  );

  return router;
}

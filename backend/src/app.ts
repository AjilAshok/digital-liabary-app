import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { resolve } from 'node:path';
import { pinoHttp } from 'pino-http';
import { getEnv } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { originCheck } from './middleware/origin-check.js';
import { requestId } from './middleware/request-id.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { catalogueRouter } from './modules/catalogue/catalogue.routes.js';
import { lookupsRouter } from './modules/catalogue/lookups.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { locationsRouter } from './modules/locations/locations.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { rolesRouter } from './modules/roles/roles.routes.js';
import { searchRouter } from './modules/search/search.routes.js';
import { scannerRouter } from './modules/scanner/scanner.routes.js';
import { importRouter } from './modules/imports/import.routes.js';

export const API_PREFIX = '/api/v1';

export function createApp(options: { frontendDistDir?: string } = {}): Express {
  const env = getEnv();
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id ?? '',
      autoLogging: { ignore: (req) => req.url?.startsWith(`${API_PREFIX}/health`) ?? false },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(originCheck(env.CORS_ORIGINS));

  // Never cache API responses containing user/session data.
  app.use(API_PREFIX, (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use(`${API_PREFIX}/health`, healthRouter());
  app.use(`${API_PREFIX}/auth`, authRouter());
  app.use(`${API_PREFIX}/roles`, rolesRouter());
  app.use(`${API_PREFIX}/dashboard`, dashboardRouter());
  app.use(API_PREFIX, catalogueRouter());
  app.use(API_PREFIX, lookupsRouter());
  app.use(`${API_PREFIX}/locations`, locationsRouter());
  app.use(`${API_PREFIX}/settings`, settingsRouter());
  app.use(`${API_PREFIX}/search`, searchRouter());
  app.use(`${API_PREFIX}/scanner`, scannerRouter());
  app.use(`${API_PREFIX}/imports`, importRouter());

  const frontendDistDir = options.frontendDistDir ?? env.FRONTEND_DIST_DIR;
  if (frontendDistDir) {
    const frontendRoot = resolve(frontendDistDir);
    app.use(express.static(frontendRoot, { index: false }));
    app.get('/{*path}', (req, res, next) => {
      if (
        req.path === API_PREFIX ||
        req.path.startsWith(`${API_PREFIX}/`) ||
        req.path.split('/').at(-1)?.includes('.')
      )
        return next();
      res.sendFile(resolve(frontendRoot, 'index.html'), (error) => {
        if (error) next(error);
      });
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

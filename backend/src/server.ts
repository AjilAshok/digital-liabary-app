import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { disconnectPrisma } from './db/prisma.js';
import { logger } from './lib/logger.js';

const env = getEnv();
const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

function shutdown(signal: string): void {
  logger.info(`${signal} received — shutting down`);
  server.close(() => {
    void disconnectPrisma().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

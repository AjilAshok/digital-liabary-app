import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

if (existsSync('.env')) process.loadEnvFile('.env');

const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          env: {
            NODE_ENV: 'test',
            JWT_SECRET: TEST_JWT_SECRET,
            // Unit tests never connect; a syntactically valid URL satisfies config validation.
            DATABASE_URL: 'postgresql://unit:unit@localhost:5432/unit_test_never_connects',
          },
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/helpers/integration-global-setup.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
          env: {
            NODE_ENV: 'test',
            JWT_SECRET: TEST_JWT_SECRET,
            DATABASE_URL: process.env['DATABASE_URL_TEST'] ?? '',
            AUTH_MAX_FAILED_LOGINS: '3',
            AUTH_LOCKOUT_MINUTES: '15',
            LOGIN_RATE_LIMIT_MAX: '1000',
            CORS_ORIGINS: 'http://localhost:4200',
          },
        },
      },
    ],
  },
});

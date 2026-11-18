import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer auto-loads .env. Load it for CLI commands when present
// (CI/production provide real environment variables instead).
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --env-file-if-exists=.env prisma/seed.ts',
  },
  datasource: {
    // A placeholder keeps offline commands (generate, validate, format) working before
    // DATABASE_URL is configured. Commands that touch the database will fail clearly.
    url: process.env.DATABASE_URL ?? 'postgresql://unset:unset@localhost:5432/unset',
  },
});

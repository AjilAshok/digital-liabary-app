import { execSync } from 'node:child_process';
import { assertSafeTestDatabaseUrl } from './test-db.js';

/** Resets the test database to the latest migrations once per integration run. */
export default function setup(): void {
  const url = assertSafeTestDatabaseUrl(
    process.env['DATABASE_URL_TEST'],
    process.env['DATABASE_URL'],
  );
  execSync('npx prisma migrate reset --force', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}

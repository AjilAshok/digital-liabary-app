/** Guards against ever running destructive test setup against a non-test database. */
export function assertSafeTestDatabaseUrl(url: string | undefined, mainUrl?: string): string {
  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST is not set. Integration tests need a dedicated PostgreSQL database ' +
        '(see backend/.env.example). Run `npm run test:unit` to run unit tests only.',
    );
  }
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(dbName)) {
    throw new Error(
      `Refusing to use database "${dbName}" for tests: its name must contain "test".`,
    );
  }
  if (mainUrl && mainUrl === url) {
    throw new Error('DATABASE_URL_TEST must differ from the application DATABASE_URL.');
  }
  return url;
}

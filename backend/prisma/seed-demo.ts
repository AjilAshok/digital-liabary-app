/**
 * Loads DEMO catalogue/circulation data for local development (`npm run db:seed:demo`).
 * Requires `npm run db:seed` first (roles + an ADMIN user). Refuses to run in production and
 * does nothing if the catalogue already has books or copies.
 */
import { seedDemoData } from '../src/db/demo-seed.js';
import { disconnectPrisma, getPrisma } from '../src/db/prisma.js';

seedDemoData(getPrisma())
  .then((result) => {
    if (result.skipped) {
      console.log(`• ${result.reason}`);
    } else {
      console.log('✔ Demo data loaded:', result.counts);
    }
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());

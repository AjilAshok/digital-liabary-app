/**
 * Development/bootstrap seed: permissions, system roles and the first administrator.
 * Run with `npm run db:seed`. Safe to run repeatedly.
 *
 * The admin credentials come from SEED_ADMIN_* environment variables — there is no default password.
 * No catalogue, member or circulation data is seeded here.
 */
import { disconnectPrisma, getPrisma } from '../src/db/prisma.js';
import { ensureUser, seedAccessControl } from '../src/db/seed-core.js';

async function main(): Promise<void> {
  const prisma = getPrisma();
  await seedAccessControl(prisma);
  console.log('✔ Permissions and system roles synchronised');

  const email = process.env['SEED_ADMIN_EMAIL'];
  const password = process.env['SEED_ADMIN_PASSWORD'];
  const fullName = process.env['SEED_ADMIN_NAME'] ?? 'System Administrator';

  if (!email || !password) {
    console.warn('⚠ SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin user creation');
    return;
  }
  if (password.startsWith('CHANGE_ME')) {
    throw new Error('SEED_ADMIN_PASSWORD still has the example value from .env.example');
  }

  const result = await ensureUser(prisma, { email, password, fullName, roleCode: 'ADMIN' });
  console.log(
    result.created
      ? `✔ Created admin user ${email}`
      : `• Admin user ${email} already exists (password not changed)`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());

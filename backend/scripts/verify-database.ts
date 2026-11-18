/**
 * Verifies the live database against the reviewed design (`npm run db:verify`).
 * Read-only: inspects the PostgreSQL catalogue and reports tables, foreign keys, unique/partial
 * indexes, trigram indexes, CHECK constraints and enums. Exits non-zero if anything is missing.
 */
import { disconnectPrisma, getPrisma } from '../src/db/prisma.js';

const EXPECTED_TABLES = [
  'users',
  'roles',
  'permissions',
  'user_roles',
  'role_permissions',
  'settings',
  'number_sequences',
  'authors',
  'publishers',
  'categories',
  'books',
  'book_authors',
  'book_editions',
  'buildings',
  'floors',
  'rooms',
  'racks',
  'shelves',
  'book_copies',
  'copy_history',
  'suppliers',
  'purchases',
  'purchase_items',
  'member_types',
  'members',
  'loans',
  'loan_renewals',
  'reservations',
  'fines',
  'fine_payments',
  'scan_logs',
  'import_batches',
  'import_rows',
  'stock_audits',
  'stock_audit_items',
  'audit_logs',
];

const EXPECTED_UNIQUE_INDEXES = [
  'book_copies_accessionNumber_key',
  'book_copies_barcode_key',
  'authors_authorNumber_key',
  'members_membershipNumber_key',
  'loans_one_active_per_copy_key',
  'reservations_one_open_per_member_edition_key',
  'reservations_one_hold_per_copy_key',
  'shelves_rackId_code_key',
  'racks_roomId_code_key',
  'rooms_floorId_code_key',
  'floors_buildingId_code_key',
];

const EXPECTED_TRGM_INDEXES = [
  'books_normalizedTitle_trgm_idx',
  'authors_normalizedName_trgm_idx',
  'publishers_normalizedName_trgm_idx',
  'members_fullName_trgm_idx',
];

const EXPECTED_ENUMS = ['CopyStatus', 'CopyCondition', 'AcquisitionType'];

async function main(): Promise<void> {
  const prisma = getPrisma();
  const problems: string[] = [];

  const [versionRow] = await prisma.$queryRaw<{ version: string }[]>`SELECT version()`;
  console.log(`Connected: ${versionRow?.version.split(',')[0] ?? 'unknown server'}`);

  const migrations = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
    SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at`;
  console.log(`Migrations applied: ${migrations.map((m) => m.migration_name).join(', ')}`);
  for (const m of migrations)
    if (!m.finished_at) problems.push(`Migration not finished: ${m.migration_name}`);

  const tables = (
    await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  ).map((t) => t.tablename);
  for (const t of EXPECTED_TABLES) if (!tables.includes(t)) problems.push(`Missing table ${t}`);
  console.log(`Tables: ${tables.length} (expected ${EXPECTED_TABLES.length})`);

  const [fkRow] = await prisma.$queryRaw<{ fks: number }[]>`
    SELECT count(*)::int AS fks FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND c.contype = 'f'`;
  const fks = fkRow?.fks ?? 0;
  console.log(`Foreign keys: ${fks}`);

  const indexes = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`;
  const indexNames = new Set(indexes.map((i) => i.indexname));
  for (const name of [...EXPECTED_UNIQUE_INDEXES, ...EXPECTED_TRGM_INDEXES]) {
    if (!indexNames.has(name)) problems.push(`Missing index ${name}`);
  }
  const partial = indexes.filter((i) => / WHERE /.test(i.indexdef)).map((i) => i.indexname);
  const trgm = indexes.filter((i) => /gin_trgm_ops/.test(i.indexdef)).map((i) => i.indexname);
  console.log(
    `Indexes: ${indexes.length} total · partial unique: ${partial.join(', ')} · trigram: ${trgm.length}`,
  );

  const checks = await prisma.$queryRaw<{ conname: string }[]>`
    SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND c.contype = 'c' ORDER BY conname`;
  console.log(`CHECK constraints: ${checks.length}`);
  if (checks.length < 23) problems.push(`Expected ≥ 23 CHECK constraints, found ${checks.length}`);

  const ext = await prisma.$queryRaw<{ extname: string }[]>`
    SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`;
  if (ext.length === 0) problems.push('Extension pg_trgm is not installed');

  const enums = await prisma.$queryRaw<{ typname: string; labels: string }[]>`
    SELECT t.typname, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS labels
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid GROUP BY t.typname`;
  for (const name of EXPECTED_ENUMS) {
    const found = enums.find((e) => e.typname === name);
    if (!found) problems.push(`Missing enum ${name}`);
    else console.log(`Enum ${name}: ${found.labels}`);
  }

  const counts = await prisma.$queryRaw<{ t: string; n: number }[]>`
    SELECT 'books' AS t, count(*)::int AS n FROM books
    UNION ALL SELECT 'book_editions', count(*)::int FROM book_editions
    UNION ALL SELECT 'book_copies', count(*)::int FROM book_copies
    UNION ALL SELECT 'members', count(*)::int FROM members
    UNION ALL SELECT 'loans', count(*)::int FROM loans
    UNION ALL SELECT 'users', count(*)::int FROM users`;
  console.log(`Rows: ${counts.map((c) => `${c.t}=${c.n}`).join(' · ')}`);

  if (problems.length > 0) {
    console.error(`\n✖ ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
    process.exitCode = 1;
  } else {
    console.log('\n✔ Database matches the reviewed design');
  }
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());

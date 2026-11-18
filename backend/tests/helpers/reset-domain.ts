import type { PrismaClient } from '../../src/generated/prisma/client.js';

/**
 * Empties every library-domain table (catalogue, inventory, circulation, imports, audits,
 * settings, audit log) while keeping users, roles and permissions. Test files that need a known
 * data set call this first, so files are independent of execution order.
 * Only ever runs against DATABASE_URL_TEST (guarded by the integration global setup).
 */
export async function resetDomainData(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      stock_audit_items, stock_audits, import_rows, import_batches, scan_logs,
      fine_payments, fines, reservations, loan_renewals, loans, members, member_types,
      copy_history, book_copies, purchase_items, purchases, suppliers,
      book_authors, book_editions, books, authors, publishers, categories,
      shelves, racks, rooms, floors, buildings,
      number_sequences, settings, audit_logs
    RESTART IDENTITY CASCADE`);
}

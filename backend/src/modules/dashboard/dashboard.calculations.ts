/**
 * Pure dashboard calculations. Every metric definition lives here so it can be unit-tested
 * independently of the database queries that feed it. Definitions are documented in
 * docs/BUSINESS_RULES.md § Dashboard metrics.
 */
import { Prisma } from '../../generated/prisma/client.js';

export const COPY_STATUSES = [
  'AVAILABLE',
  'ISSUED',
  'RESERVED',
  'DAMAGED',
  'MISSING',
  'UNDER_REPAIR',
  'DISCARDED',
  'PENDING_VERIFICATION',
] as const;
export type CopyStatusKey = (typeof COPY_STATUSES)[number];

export const ACQUISITION_TYPES = [
  'LEGACY_OLD_STOCK',
  'PURCHASED_NEW',
  'DONATED',
  'TRANSFERRED',
  'OTHER',
] as const;
export type AcquisitionKey = (typeof ACQUISITION_TYPES)[number];

/** One aggregated row from `book_copies` grouped by status, acquisition type and archived flag. */
export interface CopyGroupRow {
  status: CopyStatusKey;
  acquisitionType: AcquisitionKey;
  archived: boolean;
  copies: number;
  /** Count of copies in the group with a known acquisition price. */
  priced: number;
  /** Sum of known acquisition prices (decimal string, exact). */
  value: string;
}

export interface CopyMetrics {
  /** Physical copies held: not archived and not DISCARDED. */
  holdings: number;
  /** Copies withdrawn from stock (status DISCARDED, archived or not). */
  discarded: number;
  /** Status counts over holdings (DISCARDED is reported separately in `discarded`). */
  byStatus: Record<Exclude<CopyStatusKey, 'DISCARDED'>, number>;
  /** Acquisition-type counts over holdings. */
  byAcquisition: Record<AcquisitionKey, number>;
  inventoryValue: { amount: string; pricedCopies: number; unpricedCopies: number };
  /** All legacy copies ever digitised (including discarded/archived ones). */
  legacyDigitized: number;
}

const isHolding = (r: Pick<CopyGroupRow, 'status' | 'archived'>) =>
  !r.archived && r.status !== 'DISCARDED';

export function computeCopyMetrics(rows: readonly CopyGroupRow[]): CopyMetrics {
  const byStatus = {
    AVAILABLE: 0,
    ISSUED: 0,
    RESERVED: 0,
    DAMAGED: 0,
    MISSING: 0,
    UNDER_REPAIR: 0,
    PENDING_VERIFICATION: 0,
  };
  const byAcquisition = {
    LEGACY_OLD_STOCK: 0,
    PURCHASED_NEW: 0,
    DONATED: 0,
    TRANSFERRED: 0,
    OTHER: 0,
  };
  let holdings = 0;
  let discarded = 0;
  let legacyDigitized = 0;
  let priced = 0;
  let value = new Prisma.Decimal(0);

  for (const r of rows) {
    if (r.acquisitionType === 'LEGACY_OLD_STOCK') legacyDigitized += r.copies;
    if (r.status === 'DISCARDED') discarded += r.copies;
    if (!isHolding(r)) continue;
    holdings += r.copies;
    byStatus[r.status as keyof typeof byStatus] += r.copies;
    byAcquisition[r.acquisitionType] += r.copies;
    priced += r.priced;
    value = value.plus(new Prisma.Decimal(r.value || '0'));
  }

  return {
    holdings,
    discarded,
    byStatus,
    byAcquisition,
    inventoryValue: {
      amount: value.toFixed(2),
      pricedCopies: priced,
      unpricedCopies: holdings - priced,
    },
    legacyDigitized,
  };
}

/** Percentage rounded to one decimal; null when the denominator is unknown or zero. */
export function percentage(part: number, whole: number | null | undefined): number | null {
  if (!whole || whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export interface DigitizationProgress {
  /** Library-entered count of items in the physical accession register (null = not set). */
  registerTotal: number | null;
  legacyDigitized: number;
  /** Capped at 100 — more digitised than registered means the register total needs review. */
  percent: number | null;
  /** Digitised beyond the register total (unregistered items found), 0 when within it. */
  exceedsRegisterBy: number;
  remaining: number | null;
  pendingVerification: number;
}

export function computeDigitization(
  legacyDigitized: number,
  registerTotal: number | null,
  pendingVerification: number,
): DigitizationProgress {
  const raw = percentage(legacyDigitized, registerTotal);
  return {
    registerTotal,
    legacyDigitized,
    percent: raw === null ? null : Math.min(100, raw),
    exceedsRegisterBy: registerTotal !== null ? Math.max(0, legacyDigitized - registerTotal) : 0,
    remaining: registerTotal !== null ? Math.max(0, registerTotal - legacyDigitized) : null,
    pendingVerification,
  };
}

/** Availability split used by the "Available vs issued" chart (holdings only). */
export function availabilitySplit(byStatus: CopyMetrics['byStatus']) {
  return {
    available: byStatus.AVAILABLE,
    issued: byStatus.ISSUED,
    reserved: byStatus.RESERVED,
    /** Damaged, missing, under repair or awaiting verification — on the books but not lendable. */
    notLendable:
      byStatus.DAMAGED + byStatus.MISSING + byStatus.UNDER_REPAIR + byStatus.PENDING_VERIFICATION,
  };
}

/** Old vs new stock split (holdings only). */
export function stockSourceSplit(byAcquisition: CopyMetrics['byAcquisition']) {
  return {
    oldStock: byAcquisition.LEGACY_OLD_STOCK,
    newStock: byAcquisition.PURCHASED_NEW,
    donated: byAcquisition.DONATED,
    other: byAcquisition.TRANSFERRED + byAcquisition.OTHER,
  };
}

export interface CategoryCount {
  categoryId: string | null;
  name: string;
  copies: number;
  titles: number;
}

/**
 * Keeps the largest `limit` categories and folds the rest into "Other categories"
 * (never more series than the palette can carry). Input order does not matter.
 */
export function topCategories(rows: readonly CategoryCount[], limit = 8): CategoryCount[] {
  const sorted = [...rows].sort((a, b) => b.copies - a.copies || a.name.localeCompare(b.name));
  if (sorted.length <= limit) return sorted;
  const head = sorted.slice(0, limit - 1);
  const tail = sorted.slice(limit - 1);
  return [
    ...head,
    {
      categoryId: null,
      name: `Other categories (${tail.length})`,
      copies: tail.reduce((n, r) => n + r.copies, 0),
      titles: tail.reduce((n, r) => n + r.titles, 0),
    },
  ];
}

/** Validates an IANA time zone name; falls back to UTC. */
export function resolveTimeZone(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return value;
  } catch {
    return 'UTC';
  }
}

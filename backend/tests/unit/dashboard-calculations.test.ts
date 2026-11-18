import { describe, expect, it } from 'vitest';
import {
  availabilitySplit,
  computeCopyMetrics,
  computeDigitization,
  percentage,
  resolveTimeZone,
  stockSourceSplit,
  topCategories,
  type CopyGroupRow,
} from '../../src/modules/dashboard/dashboard.calculations.js';

const row = (r: Partial<CopyGroupRow>): CopyGroupRow => ({
  status: 'AVAILABLE',
  acquisitionType: 'LEGACY_OLD_STOCK',
  archived: false,
  copies: 1,
  priced: 0,
  value: '0',
  ...r,
});

describe('computeCopyMetrics', () => {
  const rows: CopyGroupRow[] = [
    row({
      status: 'AVAILABLE',
      acquisitionType: 'LEGACY_OLD_STOCK',
      copies: 5,
      priced: 2,
      value: '30.50',
    }),
    row({
      status: 'ISSUED',
      acquisitionType: 'PURCHASED_NEW',
      copies: 3,
      priced: 3,
      value: '45.00',
    }),
    row({ status: 'DAMAGED', acquisitionType: 'LEGACY_OLD_STOCK', copies: 1 }),
    row({ status: 'MISSING', acquisitionType: 'DONATED', copies: 2, priced: 1, value: '0.10' }),
    row({ status: 'PENDING_VERIFICATION', acquisitionType: 'TRANSFERRED', copies: 1 }),
    // Withdrawn stock: never part of holdings or inventory value.
    row({
      status: 'DISCARDED',
      acquisitionType: 'LEGACY_OLD_STOCK',
      archived: true,
      copies: 4,
      priced: 4,
      value: '99.99',
    }),
    row({
      status: 'DISCARDED',
      acquisitionType: 'PURCHASED_NEW',
      archived: false,
      copies: 1,
      priced: 1,
      value: '10.00',
    }),
    // Archived but not discarded (e.g. archived catalogue mistake) — not a holding either.
    row({
      status: 'AVAILABLE',
      acquisitionType: 'PURCHASED_NEW',
      archived: true,
      copies: 2,
      priced: 2,
      value: '20.00',
    }),
  ];
  const m = computeCopyMetrics(rows);

  it('counts holdings as non-archived, non-discarded copies', () => {
    expect(m.holdings).toBe(5 + 3 + 1 + 2 + 1);
  });

  it('counts discarded copies separately, archived or not', () => {
    expect(m.discarded).toBe(5);
  });

  it('splits holdings by status, excluding archived rows', () => {
    expect(m.byStatus).toEqual({
      AVAILABLE: 5,
      ISSUED: 3,
      RESERVED: 0,
      DAMAGED: 1,
      MISSING: 2,
      UNDER_REPAIR: 0,
      PENDING_VERIFICATION: 1,
    });
  });

  it('splits holdings by acquisition type (old vs new stock)', () => {
    expect(m.byAcquisition).toEqual({
      LEGACY_OLD_STOCK: 6,
      PURCHASED_NEW: 3,
      DONATED: 2,
      TRANSFERRED: 1,
      OTHER: 0,
    });
  });

  it('sums inventory value exactly over holdings and reports unpriced copies', () => {
    // 30.50 + 45.00 + 0.10 — floating point would give 75.60000000000001
    expect(m.inventoryValue).toEqual({ amount: '75.60', pricedCopies: 6, unpricedCopies: 6 });
  });

  it('counts every legacy copy ever digitised, including discarded ones', () => {
    expect(m.legacyDigitized).toBe(5 + 1 + 4);
  });

  it('returns zeros for an empty library', () => {
    const empty = computeCopyMetrics([]);
    expect(empty.holdings).toBe(0);
    expect(empty.inventoryValue).toEqual({ amount: '0.00', pricedCopies: 0, unpricedCopies: 0 });
  });

  it('derives the chart splits from the same numbers', () => {
    expect(availabilitySplit(m.byStatus)).toEqual({
      available: 5,
      issued: 3,
      reserved: 0,
      notLendable: 1 + 2 + 0 + 1,
    });
    expect(stockSourceSplit(m.byAcquisition)).toEqual({
      oldStock: 6,
      newStock: 3,
      donated: 2,
      other: 1,
    });
    const split = availabilitySplit(m.byStatus);
    expect(Object.values(split).reduce((a, b) => a + b, 0)).toBe(m.holdings);
  });
});

describe('percentage', () => {
  it('rounds to one decimal place', () => {
    expect(percentage(1, 3)).toBe(33.3);
    expect(percentage(2, 3)).toBe(66.7);
  });

  it('is null when the denominator is unknown or zero', () => {
    expect(percentage(5, null)).toBeNull();
    expect(percentage(5, 0)).toBeNull();
  });
});

describe('computeDigitization', () => {
  it('reports progress against the register total', () => {
    expect(computeDigitization(250, 1000, 7)).toEqual({
      registerTotal: 1000,
      legacyDigitized: 250,
      percent: 25,
      exceedsRegisterBy: 0,
      remaining: 750,
      pendingVerification: 7,
    });
  });

  it('caps at 100% and reports items beyond the register', () => {
    const d = computeDigitization(1030, 1000, 0);
    expect(d.percent).toBe(100);
    expect(d.exceedsRegisterBy).toBe(30);
    expect(d.remaining).toBe(0);
  });

  it('shows no percentage until the library sets a register total', () => {
    const d = computeDigitization(42, null, 3);
    expect(d.percent).toBeNull();
    expect(d.remaining).toBeNull();
    expect(d.legacyDigitized).toBe(42);
  });
});

describe('topCategories', () => {
  const cats = Array.from({ length: 10 }, (_, i) => ({
    categoryId: `c${i}`,
    name: `Cat ${i}`,
    copies: i + 1,
    titles: 1,
  }));

  it('keeps the largest categories and folds the tail into "Other"', () => {
    const top = topCategories(cats, 8);
    expect(top).toHaveLength(8);
    expect(top[0]!.copies).toBe(10);
    const other = top[7]!;
    expect(other.categoryId).toBeNull();
    expect(other.name).toBe('Other categories (3)');
    expect(other.copies).toBe(1 + 2 + 3);
    // Totals are preserved.
    expect(top.reduce((n, c) => n + c.copies, 0)).toBe(55);
  });

  it('returns everything, sorted, when within the limit', () => {
    const top = topCategories(cats.slice(0, 3), 8);
    expect(top.map((c) => c.copies)).toEqual([3, 2, 1]);
  });
});

describe('resolveTimeZone', () => {
  it('accepts IANA names and falls back to UTC', () => {
    expect(resolveTimeZone('Asia/Kolkata')).toBe('Asia/Kolkata');
    expect(resolveTimeZone('Not/AZone')).toBe('UTC');
    expect(resolveTimeZone(undefined)).toBe('UTC');
    expect(resolveTimeZone(42)).toBe('UTC');
  });
});

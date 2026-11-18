/** Full figures under 10,000; compact above (12.9K, 4.2M) — one rule across the dashboard. */
export function formatCount(value: number): string {
  if (Math.abs(value) < 10_000) return new Intl.NumberFormat('en').format(value);
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

/**
 * Money from an exact decimal string. Uses the library's ISO currency when configured;
 * otherwise a plain 2-decimal number (the currency is never assumed).
 */
export function formatMoney(amount: string | number, currency: string | null): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (currency) {
    try {
      return new Intl.NumberFormat('en', { style: 'currency', currency }).format(value);
    } catch {
      // Invalid currency code in settings — fall through to plain formatting.
    }
  }
  return new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value,
  );
}

export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)}%`;
}

/** "2026-11" → "Nov" (or "Nov 2026" with `withYear`). */
export function formatMonth(key: string, withYear = false): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1, 1));
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(d);
}

/** Clean axis ticks: 0 and round steps up to (at least) the max value. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => s >= rough) ?? rough;
  const niceStep = step < 1 ? 1 : step; // counts are integers
  const top = Math.ceil(max / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += niceStep) ticks.push(Math.round(v));
  return ticks;
}

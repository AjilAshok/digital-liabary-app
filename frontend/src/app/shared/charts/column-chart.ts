import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { formatCount, formatMonth, niceTicks } from './format';
import { observeWidth } from './observe-width';

export interface ColumnDatum {
  /** "YYYY-MM" */
  month: string;
  value: number;
  /** Extra tooltip/table lines, e.g. ["2 invoices", "Amount 51.00"]. */
  details?: string[];
}

const H = 220;
const M = { top: 16, right: 8, bottom: 28, left: 36 };

/**
 * Single-series monthly columns (SVG). ≤ 24px columns with a 4px rounded cap and square base,
 * hairline grid, the maximum labelled on its cap, per-column hover/focus tooltip, table twin.
 */
@Component({
  selector: 'app-column-chart',
  imports: [MatButtonModule],
  templateUrl: './column-chart.html',
  styleUrl: './charts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColumnChart {
  readonly data = input.required<ColumnDatum[]>();
  readonly ariaLabel = input.required<string>();
  readonly unit = input('copies');
  readonly detailHeaders = input<string[]>([]);

  /** Rendered width in CSS pixels (tracked with a ResizeObserver) so text never scales. */
  protected readonly W = signal(600);
  protected readonly H = H;
  protected readonly M = M;
  protected readonly showTable = signal(false);
  protected readonly hovered = signal<number | null>(null);

  protected readonly ticks = computed(() =>
    niceTicks(Math.max(0, ...this.data().map((d) => d.value))),
  );
  protected readonly top = computed(() => this.ticks()[this.ticks().length - 1] || 1);
  protected readonly band = computed(
    () => (this.W() - M.left - M.right) / Math.max(1, this.data().length),
  );
  /** Label every month, or every other one when bands get too narrow for "Nov". */
  protected readonly labelEvery = computed(() => (this.band() < 34 ? 2 : 1));
  protected showLabel(i: number): boolean {
    const n = this.data().length;
    return (n - 1 - i) % this.labelEvery() === 0;
  }
  protected readonly barWidth = computed(() => Math.min(24, this.band() * 0.6));
  protected readonly maxIndex = computed(() => {
    let best = -1;
    this.data().forEach((d, i) => {
      if (d.value > 0 && (best < 0 || d.value >= this.data()[best]!.value)) best = i;
    });
    return best;
  });

  protected y(v: number): number {
    return M.top + (H - M.top - M.bottom) * (1 - v / this.top());
  }
  protected x(i: number): number {
    return M.left + this.band() * i + this.band() / 2;
  }
  /** Column path: square at the baseline, 4px rounded data end. */
  protected columnPath(i: number, v: number): string {
    const w = this.barWidth();
    const x0 = this.x(i) - w / 2;
    const yBase = this.y(0);
    const yTop = this.y(v);
    const r = Math.min(4, w / 2, yBase - yTop);
    return `M${x0},${yBase} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + w - r} Q${x0 + w},${yTop} ${x0 + w},${yTop + r} V${yBase} Z`;
  }
  protected tooltipLeft(i: number): number {
    return (this.x(i) / this.W()) * 100;
  }

  protected readonly formatCount = formatCount;
  protected readonly formatMonth = formatMonth;

  constructor() {
    observeWidth(this.W);
  }
}

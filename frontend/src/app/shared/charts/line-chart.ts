import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { formatCount, formatMonth, niceTicks } from './format';
import { observeWidth } from './observe-width';

export interface LineSeries {
  label: string;
  /** Fixed categorical slot (colour follows the entity, never its rank). */
  slot: 1 | 2 | 3 | 4;
  values: number[];
}

const H = 240;
const M = { top: 16, right: 40, bottom: 28, left: 36 };

/**
 * Multi-series monthly line chart (SVG): 2px lines, ≥ 8px end markers with a surface ring,
 * end-value labels when they don't collide, a crosshair that snaps to the nearest month and lists
 * every series, a legend with line keys, keyboard access and a table twin. One y-axis only.
 */
@Component({
  selector: 'app-line-chart',
  imports: [MatButtonModule],
  templateUrl: './line-chart.html',
  styleUrl: './charts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineChart {
  readonly months = input.required<string[]>();
  readonly series = input.required<LineSeries[]>();
  readonly ariaLabel = input.required<string>();

  protected readonly W = signal(600);
  protected readonly H = H;
  protected readonly M = M;
  protected readonly showTable = signal(false);
  protected readonly active = signal<number | null>(null);

  protected readonly ticks = computed(() =>
    niceTicks(Math.max(0, ...this.series().flatMap((s) => s.values))),
  );
  private readonly top = computed(() => this.ticks()[this.ticks().length - 1] || 1);
  private readonly step = computed(
    () => (this.W() - M.left - M.right) / Math.max(1, this.months().length - 1),
  );
  protected readonly labelEvery = computed(() => (this.step() < 34 ? 2 : 1));

  protected x(i: number): number {
    return M.left + this.step() * i;
  }
  protected y(v: number): number {
    return M.top + (H - M.top - M.bottom) * (1 - v / this.top());
  }
  protected path(values: number[]): string {
    return values.map((v, i) => `${i === 0 ? 'M' : 'L'}${this.x(i)},${this.y(v)}`).join(' ');
  }
  protected showLabel(i: number): boolean {
    return (this.months().length - 1 - i) % this.labelEvery() === 0;
  }

  /** End labels are shown only when they are ≥ 14px apart; otherwise legend + tooltip carry them. */
  protected readonly endLabelsFit = computed(() => {
    const ends = this.series()
      .map((s) => s.values.at(-1))
      .filter((v): v is number => v !== undefined)
      .map((v) => this.y(v))
      .sort((a, b) => a - b);
    return ends.every((y, i) => i === 0 || y - ends[i - 1]! >= 14);
  });

  protected readonly total = (values: number[]) => values.reduce((a, b) => a + b, 0);

  constructor() {
    observeWidth(this.W);
  }

  /** Crosshair: snap to the nearest month from the pointer position. */
  protected onPointerMove(event: PointerEvent): void {
    const svg = event.currentTarget as SVGElement;
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * this.W();
    const i = Math.round((px - M.left) / this.step());
    this.active.set(Math.max(0, Math.min(this.months().length - 1, i)));
  }

  protected onKey(event: KeyboardEvent): void {
    const last = this.months().length - 1;
    const current = this.active() ?? last;
    if (event.key === 'ArrowLeft') this.active.set(Math.max(0, current - 1));
    else if (event.key === 'ArrowRight') this.active.set(Math.min(last, current + 1));
    else if (event.key === 'Home') this.active.set(0);
    else if (event.key === 'End') this.active.set(last);
    else return;
    event.preventDefault();
  }

  protected tooltipLeft(i: number): number {
    return (this.x(i) / this.W()) * 100;
  }

  protected readonly formatCount = formatCount;
  protected readonly formatMonth = formatMonth;
}

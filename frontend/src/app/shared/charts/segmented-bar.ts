import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { formatCount, formatPercent } from './format';

export interface Segment {
  label: string;
  value: number;
  /** Categorical slot 1–4 (fixed per entity so colour never changes with rank). */
  slot: 1 | 2 | 3 | 4;
}

/**
 * Tall segmented bar: one whole split into ≤ 6 parts, read at a glance.
 * Shares are printed inside blocks wide enough to hold them; every part's name, count and share
 * is available on hover/focus, in the bar's accessible name, and in the table view.
 */
@Component({
  selector: 'app-segmented-bar',
  imports: [MatButtonModule],
  templateUrl: './segmented-bar.html',
  styleUrl: './charts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:resize)': 'measure()' },
})
export class SegmentedBar {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly segments = input.required<Segment[]>();
  readonly ariaLabel = input.required<string>();
  readonly unit = input('copies');

  protected readonly showTable = signal(false);
  protected readonly hovered = signal<number | null>(null);
  private readonly width = signal(0);

  protected readonly total = computed(() => this.segments().reduce((n, s) => n + s.value, 0));
  protected readonly parts = computed(() => {
    const total = this.total();
    const width = this.width();
    return this.segments().map((s) => {
      const share = total > 0 ? (s.value / total) * 100 : 0;
      const shareText = formatPercent(Math.round(share));
      // Print the share inside only when the block is wide enough (≈7px per char + padding).
      const px = (share / 100) * width;
      return { ...s, share, shareText, fits: px >= shareText.length * 7 + 16 };
    });
  });
  protected readonly summary = computed(
    () =>
      `${this.ariaLabel()}: ` +
      this.parts()
        .map((p) => `${p.label} ${formatCount(p.value)} (${p.shareText})`)
        .join(', '),
  );

  constructor() {
    queueMicrotask(() => this.measure());
  }

  protected measure(): void {
    this.width.set(this.host.nativeElement.querySelector('.seg-bar')?.clientWidth ?? 0);
  }

  protected readonly formatCount = formatCount;
}

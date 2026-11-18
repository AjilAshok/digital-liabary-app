import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { formatCount } from './format';

export interface BarListItem {
  label: string;
  value: number;
  /** Secondary figure shown in the tooltip (e.g. number of titles). */
  detail?: string;
}

/**
 * Ranked horizontal bars, one hue: compare parts of one whole. Each row prints its name and value,
 * so the list is its own table view; the tooltip adds the secondary detail.
 */
@Component({
  selector: 'app-bar-list',
  template: `
    @if (items().length === 0) {
      <p class="viz-empty">{{ emptyMessage() }}</p>
    } @else {
      <ul class="bar-list" [attr.aria-label]="ariaLabel()">
        @for (item of items(); track item.label; let i = $index) {
          <li
            tabindex="0"
            (pointerenter)="hovered.set(i)"
            (pointerleave)="hovered.set(null)"
            (focus)="hovered.set(i)"
            (blur)="hovered.set(null)"
            [attr.aria-label]="
              item.label + ': ' + formatCount(item.value) + (item.detail ? ', ' + item.detail : '')
            "
          >
            <span class="bar-list__name">{{ item.label }}</span>
            <span class="bar-list__track">
              <span
                class="bar-list__bar"
                [class.bar-list__bar--hover]="hovered() === i"
                [style.width.%]="(item.value / max()) * 100"
              ></span>
            </span>
            <span class="bar-list__value">{{ formatCount(item.value) }}</span>
            @if (hovered() === i && item.detail) {
              <div class="viz-tooltip" role="tooltip">
                <span
                  ><strong>{{ formatCount(item.value) }}</strong> {{ unit() }}</span
                >
                <span>{{ item.label }} · {{ item.detail }}</span>
              </div>
            }
          </li>
        }
      </ul>
    }
  `,
  styleUrl: './charts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarList {
  readonly items = input.required<BarListItem[]>();
  readonly ariaLabel = input.required<string>();
  readonly unit = input('copies');
  readonly emptyMessage = input('Nothing to show yet.');

  protected readonly hovered = signal<number | null>(null);
  protected readonly max = computed(() => Math.max(1, ...this.items().map((i) => i.value)));
  protected readonly formatCount = formatCount;
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Progress meter: blue fill on a lighter step of the same ramp; exposes role="meter". */
@Component({
  selector: 'app-meter',
  template: `
    <div
      class="meter"
      role="meter"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-valuenow]="clamped()"
      [attr.aria-label]="ariaLabel()"
    >
      <div class="meter__fill" [style.width.%]="clamped()"></div>
    </div>
  `,
  styles: `
    .meter {
      height: 8px;
      border-radius: 4px;
      background: var(--viz-track);
      overflow: hidden;
      margin-top: 10px;
    }
    .meter__fill {
      height: 100%;
      border-radius: 4px;
      background: var(--viz-1);
      transition: width 300ms ease;
    }
    @media (forced-colors: active) {
      .meter {
        border: 1px solid CanvasText;
      }
      .meter__fill {
        background: Highlight;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Meter {
  readonly value = input.required<number>();
  readonly ariaLabel = input.required<string>();
  protected readonly clamped = computed(() => Math.max(0, Math.min(100, this.value())));
}

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Stat tile: sentence-case label, a large proportional-figure value and an optional context line.
 * `status` adds a reserved status colour WITH an icon and the label — never colour alone.
 */
@Component({
  selector: 'app-stat-tile',
  imports: [MatIconModule],
  template: `
    <div class="tile" [class.tile--critical]="status() === 'critical'">
      <div class="tile__label">
        <mat-icon aria-hidden="true">{{ icon() }}</mat-icon>
        <span>{{ label() }}</span>
      </div>
      <div class="tile__value">{{ value() }}</div>
      @if (status() === 'critical') {
        <div class="tile__status">
          <mat-icon aria-hidden="true">warning</mat-icon>{{ statusText() }}
        </div>
      } @else if (context()) {
        <div class="tile__context">{{ context() }}</div>
      }
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .tile {
      height: 100%;
      box-sizing: border-box;
      padding: 16px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      background: var(--mat-sys-surface);
    }
    .tile__label {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-large);
    }
    .tile__label mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .tile__value {
      margin-top: 8px;
      font: var(--mat-sys-headline-medium);
      font-weight: 600;
      color: var(--mat-sys-on-surface);
      overflow-wrap: anywhere;
    }
    .tile__context {
      margin-top: 4px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .tile__status {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface);
    }
    .tile__status mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
      color: var(--status-critical);
    }
    .tile--critical {
      border-left: 4px solid var(--status-critical);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatTile {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly icon = input('insights');
  readonly context = input<string>();
  readonly status = input<'critical' | null>(null);
  readonly statusText = input('Needs attention');
}

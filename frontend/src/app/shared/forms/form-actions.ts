import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/** Standard submit/cancel row for forms, with a busy state that prevents double submission. */
@Component({
  selector: 'app-form-actions',
  imports: [MatButtonModule, MatProgressSpinnerModule],
  template: `
    <div class="form-actions">
      @if (showCancel()) {
        <button mat-button type="button" (click)="cancelled.emit()" [disabled]="busy()">
          {{ cancelLabel() }}
        </button>
      }
      <button mat-flat-button type="submit" [disabled]="busy() || disabled()">
        @if (busy()) {
          <mat-spinner diameter="18" [attr.aria-label]="busyLabel()" />
        } @else {
          {{ submitLabel() }}
        }
      </button>
    </div>
  `,
  styles: `
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }
    button[type='submit'] {
      min-width: 112px;
    }
    mat-spinner {
      margin: 0 auto;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormActions {
  readonly submitLabel = input('Save');
  readonly busyLabel = input('Saving');
  readonly cancelLabel = input('Cancel');
  readonly showCancel = input(false);
  readonly busy = input(false);
  readonly disabled = input(false);
  readonly cancelled = output<void>();
}

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { toApiError } from '../../core/api/api';
import { FieldError } from '../../shared/forms/field-error';
import { DashboardService, DigitizationProgress } from './dashboard.service';

/** Lets an administrator record how many items the physical accession register contains. */
@Component({
  selector: 'app-register-total-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    FieldError,
  ],
  template: `
    <h2 mat-dialog-title>Digitization target</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content>
        <p class="hint">
          Enter the number of items in the physical accession register. Progress is the number of
          old-stock copies digitized divided by this total.
        </p>
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
        <mat-form-field class="full">
          <mat-label>Items in the register</mat-label>
          <input
            matInput
            type="number"
            min="0"
            step="1"
            formControlName="registerTotal"
            inputmode="numeric"
          />
          <mat-error
            ><app-field-error [control]="form.controls.registerTotal" label="Register total"
          /></mat-error>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        @if (data.current !== null) {
          <button mat-button type="button" (click)="clear()" [disabled]="saving()">
            Clear target
          </button>
        }
        <button mat-button type="button" mat-dialog-close [disabled]="saving()">Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">Save</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .full {
      width: 100%;
    }
    .hint {
      margin-top: 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterTotalDialog {
  protected readonly data = inject<{ current: number | null }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<RegisterTotalDialog, DigitizationProgress>);
  private readonly service = inject(DashboardService);

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group({
    registerTotal: [
      this.data.current ?? 0,
      [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)],
    ],
  });

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submit(Number(this.form.getRawValue().registerTotal));
  }

  protected clear(): void {
    this.submit(null);
  }

  private submit(value: number | null): void {
    this.saving.set(true);
    this.error.set(null);
    this.service.setRegisterTotal(value).subscribe({
      next: (progress) => this.ref.close(progress),
      error: (err: unknown) => {
        this.saving.set(false);
        this.error.set(toApiError(err).message);
      },
    });
  }
}

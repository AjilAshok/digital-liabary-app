import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { finalize } from 'rxjs';
import { toApiError } from '../../core/api/api';
import { ConfirmService } from '../../shared/ui/confirm-dialog';
import { PageHeader } from '../../shared/ui/page-header';

interface NumberingConfig {
  prefix: string;
  padding: number;
  nextValue: number;
}
interface NumberingResponse {
  configured: boolean;
  config: NumberingConfig | null;
  preview: string | null;
}

@Component({
  selector: 'app-accession-settings-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Book number settings"
      description="Choose how new book copies are numbered."
    />
    @if (loading()) {
      <p role="status">Loading settings...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (message()) {
      <p class="success" role="status">{{ message() }}</p>
    }
    @if (loaded()) {
      <form [formGroup]="form" (ngSubmit)="save()" novalidate>
        <mat-form-field
          ><mat-label>Prefix</mat-label
          ><input matInput formControlName="prefix" maxlength="20" /><mat-hint
            >Letters or numbers before the counter, such as lib.</mat-hint
          ><mat-error>Use letters, numbers, - _ . or /.</mat-error></mat-form-field
        >
        <mat-form-field
          ><mat-label>Next number</mat-label
          ><input
            matInput
            type="number"
            formControlName="nextValue"
            min="1"
            max="2147483647"
          /><mat-error>Enter a whole number between 1 and 2147483647.</mat-error></mat-form-field
        >
        <mat-form-field
          ><mat-label>Number of digits</mat-label
          ><input matInput type="number" formControlName="padding" min="0" max="12" /><mat-hint
            >Leading zeroes are added when needed.</mat-hint
          ><mat-error>Enter a whole number from 0 to 12.</mat-error></mat-form-field
        >
        <p class="preview">
          Example next number: <strong>{{ preview() }}</strong>
        </p>
        <p>Existing book numbers are not changed. Numbers already in use will be skipped.</p>
        <button mat-flat-button type="submit" [disabled]="saving() || form.invalid">
          <mat-icon>save</mat-icon>{{ saving() ? 'Saving...' : 'Save settings' }}
        </button>
      </form>
    }
  `,
  styles: [
    `
      form {
        display: grid;
        gap: 12px;
        max-width: 520px;
      }
      button {
        justify-self: start;
      }
      .preview {
        margin: 8px 0 0;
      }
      .error {
        color: var(--mat-sys-error);
      }
      .success {
        color: var(--mat-sys-primary);
      }
    `,
  ],
})
export class AccessionSettingsPage {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmService);
  protected readonly loading = signal(true);
  protected readonly loaded = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly form = this.fb.nonNullable.group({
    prefix: ['', [Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9/._-]*$/)]],
    nextValue: [
      1,
      [
        Validators.required,
        Validators.min(1),
        Validators.max(2147483647),
        Validators.pattern(/^\d+$/),
      ],
    ],
    padding: [
      6,
      [Validators.required, Validators.min(0), Validators.max(12), Validators.pattern(/^\d+$/)],
    ],
  });
  protected readonly preview = computed(() => this.example());

  constructor() {
    this.form.valueChanges.subscribe(() => this.previewTick.update((value) => value + 1));
    this.http
      .get<NumberingResponse>('/api/v1/settings/accession')
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (result) => {
          if (result.config) this.form.setValue(result.config);
          this.loaded.set(true);
        },
        error: (error: unknown) => this.error.set(toApiError(error).message),
      });
  }
  private readonly previewTick = signal(0);
  private example(): string {
    this.previewTick();
    const { prefix, padding, nextValue } = this.form.getRawValue();
    return `${prefix}${String(nextValue ?? '').padStart(Math.max(0, Math.min(12, Number(padding) || 0)), '0')}`;
  }
  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const input = this.form.getRawValue();
    this.confirm
      .confirm({
        title: 'Save book numbering?',
        message: `New copies will use this format, starting from ${this.example()}. Existing numbers will not change.`,
        confirmText: 'Save settings',
      })
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.saving.set(true);
        this.error.set(null);
        this.message.set(null);
        this.http
          .put<NumberingResponse>('/api/v1/settings/accession', input)
          .pipe(finalize(() => this.saving.set(false)))
          .subscribe({
            next: (result) => {
              if (result.config) this.form.setValue(result.config);
              this.message.set('Book numbering settings saved.');
            },
            error: (error: unknown) => this.error.set(toApiError(error).message),
          });
      });
  }
}

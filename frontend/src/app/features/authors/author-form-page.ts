import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toApiError } from '../../core/api/api';
import { PageHeader } from '../../shared/ui/page-header';
import { AuthorInput, AuthorsService, DuplicateAuthorMatch } from './authors.service';

type AuthorFormMode = 'create' | 'edit';

@Component({
  selector: 'app-author-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [title]="mode === 'create' ? 'Add author' : 'Edit author'">
      <a mat-stroked-button [routerLink]="backLink()"><mat-icon>arrow_back</mat-icon> Back</a>
    </app-page-header>

    @if (error()) {
      <div class="author-error" role="alert">
        <mat-icon>error</mat-icon><span>{{ error() }}</span>
      </div>
    }
    @if (duplicates().length) {
      <section class="author-duplicate" aria-live="polite">
        <strong>These records have the same normalized name:</strong>
        <ul>
          @for (author of duplicates(); track author.id) {
            <li>
              <a [routerLink]="['/authors', author.id]">{{ author.name }}</a> ·
              {{ author.authorNumber || 'No author number' }}
            </li>
          }
        </ul>
        <p>
          Check whether one of these is the person you intend to use. Confirm only when this is a
          different person with the same name.
        </p>
        <button mat-stroked-button type="button" [disabled]="saving()" (click)="save(true)">
          {{
            mode === 'create' ? 'Create separate author record' : 'Keep this as a separate author'
          }}
        </button>
      </section>
    }

    @if (loading()) {
      <div class="state-panel" role="status">
        <mat-icon>person</mat-icon>
        <p>Loading author…</p>
      </div>
    } @else {
      <form class="author-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="author-form-grid">
          <mat-form-field
            ><mat-label>Author name</mat-label
            ><input
              matInput
              formControlName="name"
              required
              maxlength="200"
              autocomplete="name"
            /><mat-error>Enter an author name.</mat-error></mat-form-field
          >
          <mat-form-field
            ><mat-label>Author number</mat-label
            ><input matInput formControlName="authorNumber" maxlength="30" /><mat-hint
              >Optional; must be unique when supplied.</mat-hint
            ><mat-error>Use letters, digits, dot, slash or hyphen.</mat-error></mat-form-field
          >
          <mat-form-field
            ><mat-label>Nationality</mat-label
            ><input matInput formControlName="nationality" maxlength="80"
          /></mat-form-field>
          <mat-form-field
            ><mat-label>Date of birth</mat-label
            ><input matInput type="date" formControlName="dateOfBirth" [max]="today" /><mat-error
              >Enter a valid date of birth.</mat-error
            ></mat-form-field
          >
          <mat-form-field class="wide"
            ><mat-label>Description</mat-label
            ><textarea matInput rows="5" formControlName="description" maxlength="5000"></textarea
            ><mat-hint align="end"
              >{{ form.controls.description.value.length }}/5000</mat-hint
            ></mat-form-field
          >
        </div>
        <div class="author-form-actions">
          <button mat-flat-button type="submit" [disabled]="saving()">
            <mat-icon>{{ saving() ? 'hourglass_top' : 'save' }}</mat-icon>{{
              saving() ? 'Saving…' : 'Save author'
            }}
          </button>
          <a mat-button [routerLink]="backLink()">Cancel</a>
        </div>
      </form>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .author-error,
      .author-duplicate {
        margin-bottom: 20px;
        padding: 14px 16px;
      }
      .author-error {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        border-left: 4px solid var(--mat-sys-error);
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .author-duplicate {
        border-left: 4px solid var(--status-warning);
        background: color-mix(in srgb, var(--status-warning) 12%, var(--mat-sys-surface));
      }
      .author-duplicate ul {
        margin-block: 10px;
        padding-left: 20px;
      }
      .author-duplicate li {
        padding: 3px 0;
      }
      .author-duplicate p {
        color: var(--mat-sys-on-surface-variant);
      }
      .author-form {
        max-width: 860px;
      }
      .author-form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px 18px;
      }
      .author-form-grid mat-form-field {
        width: 100%;
      }
      .author-form-grid .wide {
        grid-column: 1 / -1;
      }
      .author-form-actions {
        display: flex;
        gap: 10px;
        padding: 12px 0 28px;
      }
      @media (max-width: 650px) {
        .author-form-grid {
          grid-template-columns: 1fr;
        }
        .author-form-grid .wide {
          grid-column: auto;
        }
      }
    `,
  ],
})
export class AuthorFormPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly authors = inject(AuthorsService);
  protected readonly mode =
    (this.route.snapshot.data['mode'] as AuthorFormMode | undefined) ?? 'create';
  private readonly authorId = this.route.snapshot.paramMap.get('authorId');
  protected readonly today = new Date().toISOString().slice(0, 10);
  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    authorNumber: ['', [Validators.maxLength(30), Validators.pattern(/^[A-Za-z0-9./-]*$/)]],
    description: ['', Validators.maxLength(5000)],
    nationality: ['', Validators.maxLength(80)],
    dateOfBirth: [''],
  });
  protected readonly loading = signal(this.mode === 'edit');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly duplicates = signal<DuplicateAuthorMatch[]>([]);

  constructor() {
    if (this.mode === 'edit') {
      if (!this.authorId) {
        this.error.set('Author id is missing.');
        this.loading.set(false);
        return;
      }
      this.authors.get(this.authorId).subscribe({
        next: (author) => {
          this.form.patchValue({
            name: author.name,
            authorNumber: author.authorNumber ?? '',
            description: author.description ?? '',
            nationality: author.nationality ?? '',
            dateOfBirth: author.dateOfBirth ?? '',
          });
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.error.set(toApiError(err).message);
          this.loading.set(false);
        },
      });
    }
  }

  protected backLink(): string[] {
    return this.authorId ? ['/authors', this.authorId] : ['/authors'];
  }

  protected save(confirmDuplicateName = false): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const values = this.form.getRawValue();
    const input: AuthorInput = {
      name: values.name.trim(),
      authorNumber: values.authorNumber.trim() || null,
      description: values.description.trim() || null,
      nationality: values.nationality.trim() || null,
      dateOfBirth: values.dateOfBirth || null,
      confirmDuplicateName,
    };
    this.error.set(null);
    this.duplicates.set([]);
    this.saving.set(true);
    const request =
      this.mode === 'edit' && this.authorId
        ? this.authors.update(this.authorId, input)
        : this.authors.create(input);
    request.subscribe({
      next: (author) => {
        const id = author.id ?? this.authorId;
        if (!id) {
          this.error.set('The server saved the author but returned no author id.');
          this.saving.set(false);
          return;
        }
        void this.router.navigate(['/authors', id]);
      },
      error: (err: unknown) => this.handleError(err),
    });
  }

  private handleError(err: unknown): void {
    const apiError = toApiError(err);
    this.saving.set(false);
    this.error.set(
      apiError.fieldErrors.length
        ? `${apiError.message}: ${apiError.fieldErrors.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`
        : apiError.message,
    );
    if (apiError.code === 'POSSIBLE_DUPLICATE_AUTHOR') {
      const details = apiError.details as { matches?: DuplicateAuthorMatch[] } | undefined;
      this.duplicates.set(details?.matches ?? []);
    }
  }
}

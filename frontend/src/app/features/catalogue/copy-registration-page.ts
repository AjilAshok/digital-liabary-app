import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { toApiError } from '../../core/api/api';
import { AuthService } from '../../core/auth/auth.service';
import { Permissions } from '../../core/auth/auth.models';
import { PageHeader } from '../../shared/ui/page-header';
import { BookDetails, CatalogueService, CopyCondition, CopyStatus } from './catalogue.service';

const ACQUISITIONS = [
  ['LEGACY_OLD_STOCK', 'Old stock'],
  ['PURCHASED_NEW', 'Purchased new'],
  ['DONATED', 'Donated'],
  ['TRANSFERRED', 'Transferred'],
  ['OTHER', 'Other'],
] as const;
const CONDITIONS = [
  ['NEW', 'New'],
  ['GOOD', 'Good'],
  ['FAIR', 'Fair'],
  ['POOR', 'Poor'],
  ['DAMAGED', 'Damaged'],
] as const;
const REGISTRATION_STATUSES = [
  ['AVAILABLE', 'Available'],
  ['PENDING_VERIFICATION', 'Pending verification'],
  ['DAMAGED', 'Damaged'],
  ['UNDER_REPAIR', 'Under repair'],
] as const;

@Component({
  selector: 'app-copy-registration-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Add book copies"
      [description]="
        book() ? 'Adding copies of ' + book()!.title + '.' : 'Add copies of an existing book.'
      "
    >
      @if (book()) {
        <a mat-stroked-button [routerLink]="['/catalogue/books', book()!.id]"
          ><mat-icon>arrow_back</mat-icon> Back to book</a
        >
      }
    </app-page-header>

    @if (error()) {
      <div class="catalogue-error" role="alert">
        <mat-icon>error</mat-icon><span>{{ error() }}</span>
      </div>
    }
    @if (success().length) {
      <section class="registration-success" role="status">
        <h2>{{ success().length }} {{ success().length === 1 ? 'copy' : 'copies' }} registered</h2>
        <p>Each copy has a unique accession number.</p>
        <ul>
          @for (copy of success(); track copy.id) {
            <li>
              <a [routerLink]="['/catalogue/copies', copy.id]">{{ copy.accessionNumber }}</a> ·
              {{ label(copy.status) }}
            </li>
          }
        </ul>
        @if (scanSource) {
          <a
            mat-flat-button
            [routerLink]="scanSource === 'cover' ? '/scanner/cover' : '/scanner/isbn'"
          >
            <mat-icon>document_scanner</mat-icon> Scan next book
          </a>
        }
        <a
          mat-stroked-button
          [routerLink]="['/catalogue/copies']"
          [queryParams]="{ editionId: editionId }"
          >View edition copies</a
        >
      </section>
    } @else if (loading()) {
      <div class="state-panel" role="status">
        <mat-icon>inventory_2</mat-icon>
        <p>Loading edition…</p>
      </div>
    } @else {
      <form class="registration-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (book(); as record) {
          <div class="edition-context">
            <strong>{{ record.title }}</strong><span>{{ editionLabel() }}</span
            ><a [routerLink]="['/catalogue/books', record.id]">View title</a>
          </div>
        }
        <div class="registration-grid">
          <mat-form-field
            ><mat-label>Number of copies</mat-label
            ><input
              matInput
              type="number"
              min="1"
              max="100"
              formControlName="quantity"
              required
            /><mat-hint>Register at most 100 at a time.</mat-hint
            ><mat-error>Enter a quantity from 1 to 100.</mat-error></mat-form-field
          >
          <mat-form-field
            ><mat-label>Accession numbering</mat-label
            ><mat-select formControlName="accessionMode"
              ><mat-option value="auto">Generate next numbers</mat-option
              ><mat-option value="manual">Enter existing numbers</mat-option></mat-select
            ><mat-hint>Each copy gets its own unique number.</mat-hint></mat-form-field
          >
          @if (form.controls.accessionMode.value === 'manual') {
            <mat-form-field class="wide"
              ><mat-label>Accession numbers</mat-label
              ><textarea
                matInput
                rows="4"
                [formControl]="manualNumbers"
                placeholder="One number per line"
              ></textarea
              ><mat-hint
                >Enter exactly one unique accession number per copy.</mat-hint
              ></mat-form-field
            >
          }
          <mat-form-field
            ><mat-label>Stock source</mat-label
            ><mat-select formControlName="acquisitionType">
              @for (item of acquisitions; track item[0]) {
                <mat-option [value]="item[0]">{{ item[1] }}</mat-option>
              }
            </mat-select></mat-form-field
          >
          <mat-form-field
            ><mat-label>Acquisition date</mat-label
            ><input matInput type="date" formControlName="acquisitionDate"
          /></mat-form-field>
          <mat-form-field
            ><mat-label>Acquisition price per copy</mat-label
            ><input
              matInput
              inputmode="decimal"
              formControlName="acquisitionPrice"
              placeholder="0.00"
            /><mat-hint>Optional; use a non-negative amount.</mat-hint></mat-form-field
          >
          <mat-form-field
            ><mat-label>Condition</mat-label
            ><mat-select formControlName="condition">
              @for (item of conditions; track item[0]) {
                <mat-option [value]="item[0]">{{ item[1] }}</mat-option>
              }
            </mat-select></mat-form-field
          >
          <mat-form-field
            ><mat-label>Initial status</mat-label
            ><mat-select formControlName="status">
              @for (item of statuses; track item[0]) {
                <mat-option [value]="item[0]">{{ item[1] }}</mat-option>
              }
            </mat-select></mat-form-field
          >
          @if (canAssignShelf()) {
            <mat-form-field class="wide"
              ><mat-label>Shelf location</mat-label
              ><mat-select formControlName="shelfId"
                ><mat-option [value]="null">Not shelved</mat-option>
                @for (shelf of shelves(); track shelf.id) {
                  <mat-option [value]="shelf.id">{{ shelf.path }} · {{ shelf.label }}</mat-option>
                }</mat-select
              ><mat-hint>Location is recorded per physical copy.</mat-hint></mat-form-field
            >
          }
          <mat-form-field class="wide"
            ><mat-label>Remarks</mat-label
            ><textarea matInput rows="3" formControlName="remarks" maxlength="500"></textarea>
          </mat-form-field>
        </div>
        <div class="registration-actions">
          <button mat-flat-button type="submit" [disabled]="saving()">
            <mat-icon>{{ saving() ? 'hourglass_top' : 'inventory_2' }}</mat-icon>{{
              saving() ? 'Registering…' : 'Register copies'
            }}
          </button>
          @if (book()) {
            <a mat-button [routerLink]="['/catalogue/books', book()!.id]">Cancel</a>
          }
        </div>
      </form>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .catalogue-error {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 20px;
        padding: 14px 16px;
        border-left: 4px solid var(--mat-sys-error);
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .edition-context {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px 18px;
        padding: 14px 0;
        border-block: 1px solid var(--mat-sys-outline-variant);
      }
      .edition-context span {
        color: var(--mat-sys-on-surface-variant);
      }
      .edition-context a {
        margin-left: auto;
      }
      .registration-form {
        max-width: 920px;
      }
      .registration-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px 18px;
        padding-top: 20px;
      }
      .registration-grid mat-form-field {
        width: 100%;
      }
      .registration-grid .wide {
        grid-column: 1 / -1;
      }
      .registration-actions {
        display: flex;
        gap: 10px;
        padding: 12px 0 28px;
      }
      .registration-success {
        padding: 18px 0 28px;
        border-block: 1px solid var(--mat-sys-outline-variant);
      }
      .registration-success h2 {
        margin: 0;
        font: var(--mat-sys-title-large);
      }
      .registration-success li {
        padding: 4px 0;
      }
      @media (max-width: 650px) {
        .registration-grid {
          grid-template-columns: 1fr;
        }
        .registration-grid .wide {
          grid-column: auto;
        }
      }
    `,
  ],
})
export class CopyRegistrationPage {
  private readonly route = inject(ActivatedRoute);
  private readonly catalogue = inject(CatalogueService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  protected readonly editionId = this.route.snapshot.paramMap.get('editionId') ?? '';
  protected readonly scanSource = ['isbn', 'cover'].includes(
    this.route.snapshot.queryParamMap.get('fromScan') ?? '',
  )
    ? this.route.snapshot.queryParamMap.get('fromScan')
    : null;
  protected readonly acquisitions = ACQUISITIONS;
  protected readonly conditions = CONDITIONS;
  protected readonly statuses = REGISTRATION_STATUSES;
  protected readonly form = this.fb.nonNullable.group({
    quantity: [1, [Validators.required, Validators.min(1), Validators.max(100)]],
    accessionMode: ['auto' as 'auto' | 'manual'],
    acquisitionType: ['LEGACY_OLD_STOCK' as (typeof ACQUISITIONS)[number][0]],
    acquisitionDate: [''],
    acquisitionPrice: ['', Validators.pattern(/^\d{0,10}(\.\d{1,2})?$/)],
    condition: ['GOOD' as CopyCondition],
    status: ['AVAILABLE' as CopyStatus],
    shelfId: this.fb.control<string | null>(null),
    remarks: ['', Validators.maxLength(500)],
  });
  protected readonly manualNumbers = this.fb.nonNullable.control('');
  protected readonly canAssignShelf = computed(() => {
    this.auth.user();
    return this.auth.hasPermission(Permissions.LOCATIONS_MANAGE);
  });
  protected readonly book = signal<BookDetails | null>(null);
  protected readonly shelves = signal<{ id: string; path: string; label: string }[]>([]);
  protected readonly success = signal<{ id: string; accessionNumber: string; status: string }[]>(
    [],
  );
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    if (!this.editionId) {
      this.error.set('Edition id is missing.');
      this.loading.set(false);
      return;
    }
    const bookId = this.route.snapshot.queryParamMap.get('bookId');
    if (!bookId) {
      this.error.set('Book id is missing. Open copy registration from a book edition.');
      this.loading.set(false);
      return;
    }
    forkJoin({
      book: this.catalogue.book(bookId),
      shelves: this.catalogue.shelves().pipe(catchError(() => of({ data: [] }))),
    }).subscribe({
      next: (result) => {
        this.book.set(result.book);
        this.shelves.set(result.shelves.data);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(toApiError(err).message);
        this.loading.set(false);
      },
    });
  }

  protected editionLabel(): string {
    const edition = this.book()?.editions.find((item) => item.id === this.editionId);
    return edition
      ? [
          edition.editionStatement || 'Edition',
          edition.isbn13 || edition.isbn10 || 'No ISBN',
          edition.publisher?.name,
        ]
          .filter(Boolean)
          .join(' · ')
      : 'Edition';
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const values = this.form.getRawValue();
    const accessionNumbers = this.manualNumbers.value
      .split(/[\r\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (values.accessionMode === 'manual') {
      if (accessionNumbers.length !== values.quantity) {
        this.error.set(
          `Enter exactly ${values.quantity} accession number${values.quantity === 1 ? '' : 's'}.`,
        );
        return;
      }
      if (
        new Set(accessionNumbers.map((value) => value.toLocaleUpperCase())).size !==
        accessionNumbers.length
      ) {
        this.error.set('Accession numbers must be unique.');
        return;
      }
    }
    this.error.set(null);
    this.saving.set(true);
    this.catalogue
      .registerCopies(this.editionId, {
        quantity: values.quantity,
        accessionMode: values.accessionMode,
        ...(values.accessionMode === 'manual' ? { accessionNumbers } : {}),
        acquisitionType: values.acquisitionType,
        acquisitionDate: values.acquisitionDate || null,
        acquisitionPrice: values.acquisitionPrice || null,
        condition: values.condition,
        status: values.status,
        shelfId: this.canAssignShelf() ? values.shelfId : null,
        remarks: values.remarks.trim() || null,
      })
      .subscribe({
        next: (result) => {
          this.success.set(result.copies);
          this.saving.set(false);
        },
        error: (err: unknown) => {
          this.error.set(toApiError(err).message);
          this.saving.set(false);
        },
      });
  }

  protected label(value: string): string {
    return value
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
}

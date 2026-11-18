import { DatePipe } from '@angular/common';
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
import { Permissions } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { PageHeader } from '../../shared/ui/page-header';
import {
  AcquisitionType,
  CatalogueService,
  CopyCondition,
  CopyDetails,
  CopyStatus,
} from './catalogue.service';

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
const EDITABLE_STATUSES = [
  ['AVAILABLE', 'Available'],
  ['PENDING_VERIFICATION', 'Pending verification'],
  ['DAMAGED', 'Damaged'],
  ['UNDER_REPAIR', 'Under repair'],
  ['MISSING', 'Missing'],
  ['DISCARDED', 'Discarded'],
] as const;

@Component({
  selector: 'app-copy-details-page',
  imports: [
    DatePipe,
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
    @if (error() && !copy()) {
      <div class="state-panel state-panel--error" role="alert">
        <mat-icon>error</mat-icon>
        <h1>Could not load copy</h1>
        <p>{{ error() }}</p>
        <a mat-stroked-button routerLink="/catalogue/copies">Back to copies</a>
      </div>
    } @else if (copy(); as item) {
      <app-page-header
        [title]="'Accession ' + item.accessionNumber"
        [description]="item.book.title + ' · ' + (item.edition.editionStatement || 'Edition')"
      >
        <a mat-stroked-button [routerLink]="['/catalogue/copies']"
          ><mat-icon>arrow_back</mat-icon> All copies</a
        >
        <a mat-button [routerLink]="['/catalogue/books', item.book.id]"
          ><mat-icon>menu_book</mat-icon> Book details</a
        >
      </app-page-header>

      @if (error()) {
        <div class="catalogue-error" role="alert"><mat-icon>error</mat-icon>{{ error() }}</div>
      }
      @if (saved()) {
        <p class="catalogue-success" role="status">
          <mat-icon>check_circle</mat-icon> Copy details saved.
        </p>
      }
      <div class="copy-layout">
        <section class="copy-record" aria-label="Physical copy information">
          <dl>
            <dt>Accession number</dt>
            <dd>{{ item.accessionNumber }}</dd>
            <dt>Barcode</dt>
            <dd>{{ item.barcode || item.accessionNumber }}</dd>
            <dt>ISBN</dt>
            <dd>{{ item.edition.isbn13 || 'Not recorded' }}</dd>
            <dt>Condition</dt>
            <dd>{{ label(item.condition) }}</dd>
            <dt>Status</dt>
            <dd>{{ label(item.status) }}</dd>
            <dt>Stock source</dt>
            <dd>{{ acquisitionLabel(item.acquisitionType) }}</dd>
            <dt>Shelf</dt>
            <dd>{{ item.shelf?.path || 'Unshelved' }}</dd>
            @if (item.activeLoan) {
              <dt>Loan due</dt>
              <dd>{{ item.activeLoan.dueAt | date: 'medium' }}</dd>
            }
            @if (item.remarks) {
              <dt>Remarks</dt>
              <dd>{{ item.remarks }}</dd>
            }
          </dl>
        </section>
        @if (canWrite()) {
          <form class="copy-edit" [formGroup]="form" (ngSubmit)="save()" novalidate>
            <h2>Manage copy</h2>
            <mat-form-field
              ><mat-label>Condition</mat-label
              ><mat-select formControlName="condition">
                @for (option of conditions; track option[0]) {
                  <mat-option [value]="option[0]">{{ option[1] }}</mat-option>
                }
              </mat-select></mat-form-field
            >
            @if (item.status === 'ISSUED' || item.status === 'RESERVED') {
              <p class="detail-note">
                This copy's status is managed by circulation while it is
                {{ label(item.status).toLowerCase() }}.
              </p>
            } @else {
              <mat-form-field
                ><mat-label>Status</mat-label
                ><mat-select formControlName="status">
                  @for (option of statuses; track option[0]) {
                    <mat-option [value]="option[0]">{{ option[1] }}</mat-option>
                  }
                </mat-select></mat-form-field
              >
            }
            <mat-form-field
              ><mat-label>Stock source</mat-label
              ><mat-select formControlName="acquisitionType">
                @for (option of acquisitions; track option[0]) {
                  <mat-option [value]="option[0]">{{ option[1] }}</mat-option>
                }
              </mat-select></mat-form-field
            >
            <mat-form-field
              ><mat-label>Acquisition date</mat-label
              ><input matInput type="date" formControlName="acquisitionDate"
            /></mat-form-field>
            <mat-form-field
              ><mat-label>Acquisition price</mat-label
              ><input matInput formControlName="acquisitionPrice" inputmode="decimal" /><mat-error
                >Enter an amount like 250 or 250.50.</mat-error
              ></mat-form-field
            >
            @if (canManageLocations()) {
              <mat-form-field
                ><mat-label>Shelf location</mat-label
                ><mat-select formControlName="shelfId"
                  ><mat-option [value]="null">Not shelved</mat-option>
                  @for (shelf of shelves(); track shelf.id) {
                    <mat-option [value]="shelf.id">{{ shelf.path }} · {{ shelf.label }}</mat-option>
                  }
                </mat-select></mat-form-field
              >
            }
            <mat-form-field
              ><mat-label>Remarks</mat-label
              ><textarea matInput rows="3" formControlName="remarks" maxlength="500"></textarea>
            </mat-form-field>
            <mat-form-field
              ><mat-label>Reason for change</mat-label
              ><input matInput formControlName="reason" maxlength="300" /><mat-hint
                >Recorded in the copy history.</mat-hint
              ></mat-form-field
            >
            <button mat-flat-button type="submit" [disabled]="saving()">
              <mat-icon>{{ saving() ? 'hourglass_top' : 'save' }}</mat-icon>{{
                saving() ? 'Saving…' : 'Save copy changes'
              }}
            </button>
          </form>
        }
      </div>
      <section class="copy-history">
        <h2>Copy history</h2>
        @if (!item.history.length) {
          <p class="detail-note">No changes recorded.</p>
        } @else {
          <ol>
            @for (event of item.history; track event.id) {
              <li>
                <strong>{{ label(event.eventType) }}</strong><span>{{
                  event.reason || 'No reason recorded'
                }}</span
                ><span
                  >{{ event.changedBy || 'System' }} · {{ event.createdAt | date: 'medium' }}</span
                >
              </li>
            }
          </ol>
        }
      </section>
    } @else {
      <div class="state-panel" role="status">
        <mat-icon>inventory_2</mat-icon>
        <p>Loading copy details…</p>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .catalogue-error,
      .catalogue-success {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 14px;
        margin: 0 0 16px;
      }
      .catalogue-error {
        border-left: 4px solid var(--mat-sys-error);
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .catalogue-success {
        border-left: 4px solid var(--app-success);
        background: color-mix(in srgb, var(--app-success) 12%, var(--mat-sys-surface));
      }
      .copy-layout {
        display: grid;
        grid-template-columns: minmax(260px, 0.8fr) minmax(320px, 1.2fr);
        gap: 40px;
        align-items: start;
      }
      .copy-record {
        border-block: 1px solid var(--mat-sys-outline-variant);
      }
      dl {
        display: grid;
        grid-template-columns: minmax(120px, 0.8fr) 1.2fr;
        margin: 0;
      }
      dt,
      dd {
        margin: 0;
        padding: 11px 8px;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
        overflow-wrap: anywhere;
      }
      dt {
        color: var(--mat-sys-on-surface-variant);
      }
      .copy-edit {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0 14px;
      }
      .copy-edit h2,
      .copy-edit button,
      .copy-edit .detail-note {
        grid-column: 1 / -1;
      }
      .copy-edit h2,
      .copy-history h2 {
        margin: 0 0 16px;
        font: var(--mat-sys-title-large);
      }
      .copy-edit mat-form-field {
        width: 100%;
      }
      .copy-edit button {
        justify-self: start;
        margin: 4px 0 20px;
      }
      .detail-note {
        color: var(--mat-sys-on-surface-variant);
      }
      .copy-history {
        border-top: 1px solid var(--mat-sys-outline-variant);
        padding-top: 20px;
      }
      .copy-history ol {
        padding-left: 22px;
      }
      .copy-history li {
        padding: 8px 0;
      }
      .copy-history li span {
        display: block;
        margin-top: 2px;
        color: var(--mat-sys-on-surface-variant);
      }
      @media (max-width: 760px) {
        .copy-layout {
          grid-template-columns: 1fr;
          gap: 28px;
        }
      }
      @media (max-width: 520px) {
        .copy-edit {
          grid-template-columns: 1fr;
        }
        .copy-edit h2,
        .copy-edit button,
        .copy-edit .detail-note {
          grid-column: auto;
        }
      }
    `,
  ],
})
export class CopyDetailsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly catalogue = inject(CatalogueService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  protected readonly acquisitions = ACQUISITIONS;
  protected readonly conditions = CONDITIONS;
  protected readonly statuses = EDITABLE_STATUSES;
  protected readonly form = this.fb.nonNullable.group({
    condition: ['GOOD' as CopyCondition],
    status: ['AVAILABLE' as CopyStatus],
    acquisitionType: ['LEGACY_OLD_STOCK' as AcquisitionType],
    acquisitionDate: [''],
    acquisitionPrice: ['', Validators.pattern(/^\d{1,10}(\.\d{1,2})?$/)],
    shelfId: this.fb.control<string | null>(null),
    remarks: ['', Validators.maxLength(500)],
    reason: ['', Validators.maxLength(300)],
  });
  protected readonly copy = signal<CopyDetails | null>(null);
  protected readonly shelves = signal<{ id: string; path: string; label: string }[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);
  protected readonly saving = signal(false);
  protected readonly canWrite = computed(() => {
    this.auth.user();
    return this.auth.hasPermission(Permissions.COPIES_WRITE);
  });
  protected readonly canManageLocations = computed(() => {
    this.auth.user();
    return this.auth.hasPermission(Permissions.LOCATIONS_MANAGE);
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('copyId');
    if (!id) {
      this.error.set('Copy id is missing.');
      return;
    }
    forkJoin({
      copy: this.catalogue.copy(id),
      shelves: this.catalogue.shelves().pipe(catchError(() => of({ data: [] }))),
    }).subscribe({
      next: (result) => {
        this.copy.set(result.copy);
        this.shelves.set(result.shelves.data);
        this.form.patchValue({
          condition: result.copy.condition as CopyCondition,
          status: result.copy.status as CopyStatus,
          acquisitionType: result.copy.acquisitionType,
          acquisitionDate: result.copy.acquisitionDate ?? '',
          acquisitionPrice: result.copy.acquisitionPrice ?? '',
          shelfId: result.copy.shelf?.id ?? null,
          remarks: result.copy.remarks ?? '',
        });
      },
      error: (err: unknown) => this.error.set(toApiError(err).message),
    });
  }

  protected save(): void {
    const record = this.copy();
    if (!record || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const values = this.form.getRawValue();
    const input: Record<string, unknown> = {
      condition: values.condition,
      acquisitionType: values.acquisitionType,
      acquisitionDate: values.acquisitionDate,
      acquisitionPrice: values.acquisitionPrice,
      remarks: values.remarks,
      reason: values.reason,
    };
    if (this.canManageLocations()) input['shelfId'] = values.shelfId;
    if (record.status !== 'ISSUED' && record.status !== 'RESERVED') input['status'] = values.status;
    this.error.set(null);
    this.saved.set(false);
    this.saving.set(true);
    this.catalogue.updateCopy(record.id, input).subscribe({
      next: (updated) => {
        this.copy.set(updated);
        this.saved.set(true);
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
  protected acquisitionLabel(value: string): string {
    return this.acquisitions.find((item) => item[0] === value)?.[1] ?? this.label(value);
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { toApiError } from '../../core/api/api';
import { Permissions } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { PageHeader } from '../../shared/ui/page-header';
import { CatalogueService, CopyRow } from './catalogue.service';

const STATUS_OPTIONS = [
  ['AVAILABLE', 'Available'],
  ['ISSUED', 'Issued'],
  ['RESERVED', 'Reserved'],
  ['DAMAGED', 'Damaged'],
  ['MISSING', 'Missing'],
  ['UNDER_REPAIR', 'Under repair'],
  ['DISCARDED', 'Discarded'],
  ['PENDING_VERIFICATION', 'Pending verification'],
];
const ACQUISITION_LABELS: Record<string, string> = {
  LEGACY_OLD_STOCK: 'Old stock',
  PURCHASED_NEW: 'New stock',
  DONATED: 'Donated',
  TRANSFERRED: 'Transferred',
  OTHER: 'Other',
};

@Component({
  selector: 'app-copies-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    MatTooltipModule,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Book inventory"
      [description]="
        editionId()
          ? 'Copies registered for one edition. Each accession identifies one physical item.'
          : 'Every physical item has its own accession number, condition, status and shelf.'
      "
    >
      <a mat-stroked-button routerLink="/catalogue/books"
        ><mat-icon>menu_book</mat-icon> Book catalogue</a
      >
    </app-page-header>

    <section class="copies-filters" aria-label="Filter physical copies">
      <mat-form-field class="copy-search"
        ><mat-label>Search books, authors, numbers or shelves</mat-label
        ><mat-icon matPrefix>search</mat-icon
        ><input matInput [formControl]="search" autocomplete="off" />
        @if (search.value) {
          <button
            mat-icon-button
            matSuffix
            type="button"
            aria-label="Clear search"
            (click)="search.setValue('')"
          >
            <mat-icon>close</mat-icon>
          </button>
        }
      </mat-form-field>
      <mat-form-field
        ><mat-label>Status</mat-label
        ><mat-select [formControl]="status"
          ><mat-option value="">All statuses</mat-option>
          @for (item of statuses; track item[0]) {
            <mat-option [value]="item[0]">{{ item[1] }}</mat-option>
          }
        </mat-select></mat-form-field
      >
      <mat-form-field
        ><mat-label>Stock source</mat-label
        ><mat-select [formControl]="stock"
          ><mat-option value="">All stock</mat-option><mat-option value="old">Old stock</mat-option
          ><mat-option value="new">New stock</mat-option></mat-select
        ></mat-form-field
      >
      <span class="copy-count">{{ total() }} {{ total() === 1 ? 'copy' : 'copies' }}</span>
    </section>

    @if (error()) {
      <div class="state-panel state-panel--error" role="alert">
        <mat-icon>error</mat-icon>
        <p>{{ error() }}</p>
        <button mat-stroked-button type="button" (click)="load()">Try again</button>
      </div>
    } @else if (loading() && rows().length === 0) {
      <div class="state-panel" role="status">
        <mat-icon>inventory_2</mat-icon>
        <p>Loading copies…</p>
      </div>
    } @else if (!rows().length) {
      <div class="state-panel">
        <mat-icon>inventory_2</mat-icon>
        <h2>No copies found</h2>
        <p>Try changing the search or filters, or register copies from a book edition.</p>
      </div>
    } @else {
      <div class="catalogue-table-wrap" [attr.aria-busy]="loading()">
        <table class="catalogue-table">
          <thead>
            <tr>
              <th scope="col">Book</th>
              <th scope="col">Author</th>
              <th scope="col">Author number</th>
              <th scope="col">Book number</th>
              <th scope="col">ISBN</th>
              <th scope="col">Shelf</th>
              <th scope="col">Price</th>
              <th scope="col">Stock source</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (copy of rows(); track copy.id) {
              <tr>
                <th scope="row">
                  <a class="catalogue-title" [routerLink]="['/catalogue/books', copy.book.id]">{{
                    copy.book.title
                  }}</a>
                  @if (copy.edition.editionStatement) {
                    <span class="catalogue-secondary">{{ copy.edition.editionStatement }}</span>
                  }
                </th>
                <td>
                  @for (author of copy.book.authors || []; track $index) {
                    <div>{{ author.name }}</div>
                  } @empty {
                    Not recorded
                  }
                </td>
                <td>
                  @for (author of copy.book.authors || []; track $index) {
                    <div>{{ author.authorNumber || 'Not recorded' }}</div>
                  } @empty {
                    Not recorded
                  }
                </td>
                <td>{{ copy.accessionNumber }}</td>
                <td>{{ copy.edition.isbn13 || 'Not recorded' }}</td>
                <td>{{ copy.shelf?.path || 'Unshelved' }}</td>
                <td>{{ copy.acquisitionPrice ?? 'Not recorded' }}</td>
                <td>
                  {{ acquisitionLabel(copy.acquisitionType) }}
                  @if (copy.acquisitionDate) {
                    <span class="catalogue-secondary">{{
                      copy.acquisitionDate | date: 'mediumDate'
                    }}</span>
                  }
                </td>
                <td>
                  {{ label(copy.status) }}
                  <span class="catalogue-secondary">{{ label(copy.condition) }}</span>
                </td>
                <td class="copy-actions">
                  <a
                    mat-icon-button
                    [routerLink]="['/catalogue/copies', copy.id]"
                    [attr.aria-label]="'View copy ' + copy.accessionNumber"
                    matTooltip="View copy"
                  >
                    <mat-icon>visibility</mat-icon>
                  </a>
                  @if (canWrite()) {
                    <a
                      mat-icon-button
                      [routerLink]="['/catalogue/copies', copy.id]"
                      [attr.aria-label]="'Edit copy ' + copy.accessionNumber"
                      matTooltip="Edit copy"
                    >
                      <mat-icon>edit</mat-icon>
                    </a>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <mat-paginator
        [length]="total()"
        [pageIndex]="page() - 1"
        [pageSize]="pageSize()"
        [pageSizeOptions]="[10, 20, 50]"
        (page)="changePage($event)"
        aria-label="Physical copy pages"
      />
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .copies-filters {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 12px;
      }
      .copy-search {
        flex: 1 1 320px;
      }
      .copies-filters mat-form-field:not(.copy-search) {
        width: 190px;
      }
      .copy-count {
        margin: 14px 0 0 auto;
        color: var(--mat-sys-on-surface-variant);
      }
      .catalogue-table-wrap {
        overflow-x: auto;
        border-block: 1px solid var(--mat-sys-outline-variant);
      }
      .catalogue-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
      }
      th,
      td {
        padding: 13px 14px;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
        vertical-align: top;
      }
      thead th {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-label-medium);
        white-space: nowrap;
      }
      tbody tr:last-child th,
      tbody tr:last-child td {
        border-bottom: 0;
      }
      .catalogue-title {
        color: var(--mat-sys-primary);
        font-weight: 600;
      }
      .catalogue-secondary {
        display: block;
        margin-top: 3px;
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
      }
      .copy-actions {
        white-space: nowrap;
      }
      @media (max-width: 650px) {
        .copies-filters mat-form-field:not(.copy-search) {
          flex: 1 1 140px;
          width: auto;
        }
        .copy-count {
          margin: 0 0 12px auto;
        }
        th,
        td {
          padding: 11px;
        }
      }
    `,
  ],
})
export class CopiesPage {
  private readonly route = inject(ActivatedRoute);
  private readonly catalogue = inject(CatalogueService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly canWrite = computed(() => this.auth.hasPermission(Permissions.COPIES_WRITE));
  protected readonly statuses = STATUS_OPTIONS;
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly status = new FormControl('', { nonNullable: true });
  protected readonly stock = new FormControl('', { nonNullable: true });
  protected readonly rows = signal<CopyRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);
  protected readonly editionId = signal<string | null>(null);
  protected readonly bookId = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.editionId.set(params.get('editionId'));
      this.bookId.set(params.get('bookId'));
      this.page.set(1);
      this.load();
    });
    this.search.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.page.set(1);
        this.load();
      });
    this.status.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.page.set(1);
      this.load();
    });
    this.stock.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.page.set(1);
      this.load();
    });
  }

  protected load(): void {
    const filters: Record<string, string> = {
      search: this.search.value,
      status: this.status.value,
      stock: this.stock.value,
      editionId: this.editionId() ?? '',
      bookId: this.bookId() ?? '',
    };
    this.loading.set(true);
    this.error.set(null);
    this.catalogue.copies(this.page(), this.pageSize(), filters).subscribe({
      next: (result) => {
        this.rows.set(result.data);
        this.total.set(result.meta.total);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(toApiError(err).message);
        this.loading.set(false);
      },
    });
  }

  protected changePage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.pageSize.set(event.pageSize);
    this.load();
  }
  protected label(value: string): string {
    return value
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  protected acquisitionLabel(value: string): string {
    return ACQUISITION_LABELS[value] ?? value;
  }
}

import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toApiError } from '../../core/api/api';
import { Permissions } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { PageHeader } from '../../shared/ui/page-header';
import { BookDetails, BookStockRow, CatalogueService } from './catalogue.service';

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Available',
  ISSUED: 'Issued',
  RESERVED: 'Reserved',
  DAMAGED: 'Damaged',
  MISSING: 'Missing',
  UNDER_REPAIR: 'Under repair',
  DISCARDED: 'Discarded',
  PENDING_VERIFICATION: 'Pending verification',
};

@Component({
  selector: 'app-book-details-page',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatPaginatorModule, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error()) {
      <div class="state-panel state-panel--error" role="alert">
        <mat-icon>error</mat-icon>
        <h1>Could not load book</h1>
        <p>{{ error() }}</p>
        <a mat-stroked-button routerLink="/catalogue/books">Back to catalogue</a>
      </div>
    } @else if (book(); as record) {
      <app-page-header
        [title]="record.title"
        [description]="record.subtitle || 'Book title and edition records.'"
      >
        <a mat-stroked-button routerLink="/catalogue/books"
          ><mat-icon>arrow_back</mat-icon> Catalogue</a
        >
        @if (canWrite()) {
          <a mat-stroked-button [routerLink]="['/catalogue/books', record.id, 'edit']"
            ><mat-icon>edit</mat-icon> Edit title</a
          ><a mat-flat-button [routerLink]="['/catalogue/books', record.id, 'editions', 'new']"
            ><mat-icon>add</mat-icon> Add edition</a
          >
        }
      </app-page-header>

      <section class="book-summary" aria-label="Book information">
        <div>
          <h2>Contributors</h2>
          @if (record.authors.length) {
            <ul>
              @for (author of record.authors; track author.id) {
                <li>
                  {{ author.name }}
                  @if (author.authorNumber) {
                    <span class="detail-muted"> · {{ author.authorNumber }}</span>
                  }
                  <span class="detail-muted"> · {{ author.role.toLowerCase() }}</span>
                </li>
              }
            </ul>
          } @else {
            <p class="detail-muted">No authors assigned.</p>
          }
        </div>
        <div>
          <h2>Classification</h2>
          <p>{{ record.category?.name || 'Uncategorised' }}</p>
          <p class="detail-muted">
            {{ record.originalLanguage || 'Original language not recorded' }}
          </p>
        </div>
        <div>
          <h2>Physical holdings</h2>
          <p class="stock-total">{{ record.copyStats.holdings }}</p>
          <p class="detail-muted">{{ stockSummary(record) }}</p>
          <a mat-button [routerLink]="['/catalogue/copies']" [queryParams]="{ bookId: record.id }"
            >View all copies</a
          >
        </div>
      </section>
      @if (record.description) {
        <p class="book-description">{{ record.description }}</p>
      }

      <section class="editions-section" aria-labelledby="editions-heading">
        <div class="section-heading">
          <div>
            <h2 id="editions-heading">Editions</h2>
            <p>
              ISBN, publisher and publication details belong to an edition, not to an individual
              copy.
            </p>
          </div>
          <a mat-button [routerLink]="['/catalogue/books', record.id, 'editions', 'new']"
            ><mat-icon>add</mat-icon> Add edition</a
          >
        </div>
        @if (record.editions.length === 0) {
          <div class="catalogue-empty">No editions are recorded yet.</div>
        }
        @for (edition of record.editions; track edition.id) {
          <article class="edition-row">
            @if (edition.hasCover) {
              <img
                class="edition-cover"
                [src]="coverUrl(edition.id)"
                [alt]="'Cover of ' + record.title"
                loading="lazy"
              />
            } @else {
              <div class="edition-placeholder" aria-hidden="true">
                <mat-icon>menu_book</mat-icon>
              </div>
            }
            <div class="edition-main">
              <h3>
                {{ edition.editionStatement || 'Edition' }}
                @if (edition.publicationYear) {
                  <span> · {{ edition.publicationYear }}</span>
                }
              </h3>
              <p>
                {{ edition.isbn13 || edition.isbn10 || 'No ISBN' }} ·
                {{ edition.publisher?.name || 'Publisher not recorded' }}
              </p>
              <p class="detail-muted">
                {{ edition.language || 'Language not recorded' }}
                @if (edition.pageCount) {
                  · {{ edition.pageCount }} pages
                }
                @if (edition.format) {
                  · {{ edition.format }}
                }
              </p>
              <p>
                <strong>{{ edition.copies.holdings }}</strong> copies ·
                {{ edition.copies.available }} available
              </p>
            </div>
            <div class="edition-actions">
              @if (canWrite()) {
                <a
                  mat-button
                  [routerLink]="['/catalogue/editions', edition.id, 'edit']"
                  [queryParams]="{ bookId: record.id }"
                  ><mat-icon>edit</mat-icon> Edit</a
                >
              }
              <a
                mat-stroked-button
                [routerLink]="['/catalogue/copies']"
                [queryParams]="{ editionId: edition.id }"
                >Copies</a
              >
              @if (canRegister()) {
                <a
                  mat-flat-button
                  [routerLink]="['/catalogue/editions', edition.id, 'copies', 'new']"
                  [queryParams]="{ bookId: record.id }"
                  ><mat-icon>add</mat-icon> Register copies</a
                >
              }
            </div>
          </article>
        }
      </section>

      @if (canReadStock()) {
        <section class="stock-section" aria-labelledby="stock-heading">
          <div class="section-heading">
            <div>
              <h2 id="stock-heading">Physical stock and history</h2>
              <p>Accession-level location, acquisition and circulation details.</p>
            </div>
            <span>{{ stockTotal() }} copies</span>
          </div>
          @if (stockError()) {
            <div class="state-panel state-panel--error" role="alert">
              <mat-icon>error</mat-icon>
              <p>{{ stockError() }}</p>
              <button mat-stroked-button type="button" (click)="loadStock()">Try again</button>
            </div>
          } @else if (stockLoading() && !stockRows().length) {
            <div class="state-panel" role="status">
              <mat-icon>inventory_2</mat-icon>
              <p>Loading physical stock…</p>
            </div>
          } @else if (!stockRows().length) {
            <div class="catalogue-empty">No physical copies registered.</div>
          } @else {
            <div class="stock-table-wrap">
              <table class="stock-table">
                <thead>
                  <tr>
                    <th scope="col">Accession / edition</th>
                    <th scope="col">Status</th>
                    <th scope="col">Shelf</th>
                    <th scope="col">Acquisition / purchase</th>
                    <th scope="col">Transactions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (copy of stockRows(); track copy.id) {
                    <tr>
                      <th scope="row">
                        <a [routerLink]="['/catalogue/copies', copy.id]">{{
                          copy.accessionNumber
                        }}</a><span
                          >{{ copy.edition.editionStatement || 'Edition' }} ·
                          {{ copy.edition.isbn13 || 'No ISBN' }}</span
                        >
                      </th>
                      <td>
                        {{ label(copy.status) }}<span>{{ label(copy.condition) }}</span>
                      </td>
                      <td>{{ copy.shelf?.path || 'Unshelved' }}</td>
                      <td>
                        {{ acquisitionLabel(copy.acquisitionType) }}
                        @if (copy.acquisitionDate) {
                          <span>{{ copy.acquisitionDate | date: 'mediumDate' }}</span>
                        }
                        @if (copy.purchase) {
                          <span
                            >{{ copy.purchase.supplier }} ·
                            {{ copy.purchase.invoiceNumber || 'No invoice' }} ·
                            {{ copy.purchase.unitPrice }}</span
                          >
                        } @else if (copy.supplier) {
                          <span>{{ copy.supplier.name }}</span>
                        }
                      </td>
                      <td>
                        @if (copy.transactions.length) {
                          <details>
                            <summary>
                              {{ copy.transactions.length }} recent
                              {{ copy.transactions.length === 1 ? 'transaction' : 'transactions' }}
                            </summary>
                            <ul>
                              @for (transaction of copy.transactions; track transaction.id) {
                                <li>
                                  <strong>{{ label(transaction.status) }}</strong> ·
                                  {{ transaction.member.fullName }} ({{
                                    transaction.member.membershipNumber
                                  }})<span
                                    >Issued {{ transaction.issuedAt | date: 'mediumDate' }} · due
                                    {{ transaction.dueAt | date: 'mediumDate' }}
                                    @if (transaction.returnedAt) {
                                      · returned {{ transaction.returnedAt | date: 'mediumDate' }}
                                    }
                                  </span>
                                  @for (renewal of transaction.renewals; track renewal.createdAt) {
                                    <span
                                      >Renewed: {{ renewal.previousDueAt | date: 'mediumDate' }} →
                                      {{ renewal.newDueAt | date: 'mediumDate' }}</span
                                    >
                                  }
                                </li>
                              }
                            </ul>
                          </details>
                        } @else {
                          <span>No loan history</span>
                        }
                        <details class="copy-history">
                          <summary>{{ copy.history.length }} copy changes</summary>
                          <ul>
                            @for (event of copy.history; track event.id) {
                              <li>
                                {{ label(event.eventType) }} ·
                                {{ event.reason || 'No reason recorded'
                                }}<span
                                  >{{ event.createdAt | date: 'medium' }} ·
                                  {{ event.changedBy || 'System' }}</span
                                >
                              </li>
                            }
                          </ul>
                        </details>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <mat-paginator
              [length]="stockTotal()"
              [pageIndex]="stockPage() - 1"
              [pageSize]="stockPageSize()"
              [pageSizeOptions]="[10, 20, 50]"
              (page)="changeStockPage($event)"
              aria-label="Book physical stock pages"
            />
          }
        </section>
      }
    } @else {
      <div class="state-panel" role="status">
        <mat-icon>menu_book</mat-icon>
        <p>Loading book details…</p>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .book-summary {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 24px;
        padding: 18px 0;
        border-block: 1px solid var(--mat-sys-outline-variant);
      }
      .book-summary h2 {
        margin: 0 0 8px;
        font: var(--mat-sys-title-medium);
      }
      .book-summary p,
      .book-summary ul {
        margin: 4px 0;
      }
      .book-summary ul {
        padding-left: 20px;
      }
      .detail-muted {
        color: var(--mat-sys-on-surface-variant);
      }
      .stock-total {
        font: var(--mat-sys-headline-medium);
      }
      .book-description {
        max-width: 90ch;
        white-space: pre-line;
        padding: 12px 0 4px;
      }
      .editions-section {
        margin-top: 30px;
      }
      .section-heading {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
      }
      .section-heading h2 {
        margin: 0 0 4px;
        font: var(--mat-sys-title-large);
      }
      .section-heading p {
        margin: 0 0 14px;
        color: var(--mat-sys-on-surface-variant);
      }
      .edition-row {
        display: grid;
        grid-template-columns: 76px minmax(220px, 1fr) auto;
        align-items: center;
        gap: 18px;
        padding: 18px 0;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }
      .edition-cover,
      .edition-placeholder {
        width: 76px;
        height: 104px;
        object-fit: cover;
        border: 1px solid var(--mat-sys-outline-variant);
      }
      .edition-placeholder {
        display: grid;
        place-items: center;
        color: var(--mat-sys-on-surface-variant);
      }
      .edition-main h3 {
        margin: 0 0 5px;
        font: var(--mat-sys-title-medium);
      }
      .edition-main h3 span,
      .edition-main p {
        color: var(--mat-sys-on-surface-variant);
      }
      .edition-main p {
        margin: 4px 0;
      }
      .edition-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 4px;
      }
      .catalogue-empty {
        padding: 20px 0;
        border-top: 1px solid var(--mat-sys-outline-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      .stock-section {
        margin-top: 30px;
      }
      .stock-section .section-heading {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 12px;
      }
      .stock-section .section-heading h2 {
        margin: 0 0 4px;
        font: var(--mat-sys-title-large);
      }
      .stock-section .section-heading p,
      .stock-section .section-heading > span {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
      }
      .stock-table-wrap {
        overflow-x: auto;
        border-block: 1px solid var(--mat-sys-outline-variant);
      }
      .stock-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
      }
      .stock-table th,
      .stock-table td {
        min-width: 130px;
        padding: 11px 12px;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
        vertical-align: top;
      }
      .stock-table thead th {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-label-medium);
      }
      .stock-table td span,
      .stock-table th span {
        display: block;
        margin-top: 4px;
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
      }
      .stock-table details {
        margin-top: 6px;
      }
      .stock-table details summary {
        cursor: pointer;
        color: var(--mat-sys-primary);
      }
      .stock-table details ul {
        min-width: 240px;
        padding-left: 18px;
      }
      .stock-table details li {
        padding: 4px 0;
      }
      @media (max-width: 850px) {
        .edition-row {
          grid-template-columns: 64px minmax(0, 1fr);
        }
        .edition-cover,
        .edition-placeholder {
          width: 64px;
          height: 90px;
        }
        .edition-actions {
          grid-column: 1 / -1;
          justify-content: flex-start;
        }
      }
      @media (max-width: 650px) {
        .book-summary {
          grid-template-columns: 1fr;
          gap: 18px;
        }
        .section-heading {
          flex-direction: column;
        }
      }
    `,
  ],
})
export class BookDetailsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly catalogue = inject(CatalogueService);
  private readonly auth = inject(AuthService);
  protected readonly book = signal<BookDetails | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly stockRows = signal<BookStockRow[]>([]);
  protected readonly stockTotal = signal(0);
  protected readonly stockPage = signal(1);
  protected readonly stockPageSize = signal(10);
  protected readonly stockLoading = signal(true);
  protected readonly stockError = signal<string | null>(null);
  private readonly bookId = this.route.snapshot.paramMap.get('bookId');
  protected readonly canWrite = computed(() => {
    this.auth.user();
    return this.auth.hasPermission(Permissions.CATALOGUE_WRITE);
  });
  protected readonly canRegister = computed(() => {
    this.auth.user();
    return this.auth.hasPermission(Permissions.COPIES_WRITE);
  });
  protected readonly canReadStock = computed(() => {
    this.auth.user();
    return this.auth.hasPermission(Permissions.COPIES_READ);
  });

  constructor() {
    if (!this.bookId) {
      this.error.set('Book record not found.');
      return;
    }
    this.catalogue.book(this.bookId).subscribe({
      next: (record) => {
        this.book.set(record);
        if (this.canReadStock()) this.loadStock();
      },
      error: (err: unknown) => this.error.set(toApiError(err).message),
    });
  }

  protected coverUrl(id: string): string {
    return `/api/v1/editions/${id}/cover`;
  }

  protected stockSummary(record: BookDetails): string {
    return (
      Object.entries(record.copyStats.byStatus)
        .map(([status, count]) => `${count} ${STATUS_LABELS[status] ?? status.toLowerCase()}`)
        .join(' · ') || 'No copies registered'
    );
  }

  protected loadStock(): void {
    if (!this.bookId) return;
    this.stockLoading.set(true);
    this.stockError.set(null);
    this.catalogue.bookStock(this.bookId, this.stockPage(), this.stockPageSize()).subscribe({
      next: (result) => {
        this.stockRows.set(result.data);
        this.stockTotal.set(result.meta.total);
        this.stockLoading.set(false);
      },
      error: (error: unknown) => {
        this.stockError.set(toApiError(error).message);
        this.stockLoading.set(false);
      },
    });
  }

  protected changeStockPage(event: PageEvent): void {
    this.stockPage.set(event.pageIndex + 1);
    this.stockPageSize.set(event.pageSize);
    this.loadStock();
  }

  protected label(value: string): string {
    return value
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  protected acquisitionLabel(value: string): string {
    return value === 'LEGACY_OLD_STOCK'
      ? 'Old stock'
      : value === 'PURCHASED_NEW'
        ? 'New stock'
        : this.label(value);
  }
}

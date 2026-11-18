import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { toApiError } from '../../core/api/api';
import { PageHeader } from '../../shared/ui/page-header';
import { CatalogueService, CopyStatus, LookupOption } from '../catalogue/catalogue.service';
import { LocationBuilding, LocationsService } from '../locations/locations.service';
import { SearchFilters, SearchResponse, SearchService } from './search.service';

const STATUS_OPTIONS: { value: CopyStatus; label: string }[] = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'ISSUED', label: 'Issued' },
  { value: 'RESERVED', label: 'Reserved' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'MISSING', label: 'Missing' },
  { value: 'UNDER_REPAIR', label: 'Under repair' },
  { value: 'DISCARDED', label: 'Discarded' },
  { value: 'PENDING_VERIFICATION', label: 'Pending verification' },
];

@Component({
  selector: 'app-search-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Advanced search"
      description="Search titles, contributors, identifiers, publishers, categories and shelf locations across the library database."
    >
      <a mat-stroked-button routerLink="/catalogue/books"
        ><mat-icon>menu_book</mat-icon> Catalogue</a
      >
    </app-page-header>

    <section class="search-controls" aria-label="Library search controls">
      <mat-form-field class="query-field"
        ><mat-label>Search library</mat-label><mat-icon matPrefix>search</mat-icon
        ><input
          matInput
          [formControl]="query"
          placeholder="Title, author, author number, ISBN, accession, publisher, category or shelf"
          autocomplete="off"
        />
        @if (query.value) {
          <button
            mat-icon-button
            matSuffix
            type="button"
            aria-label="Clear search"
            (click)="query.setValue('')"
          >
            <mat-icon>close</mat-icon>
          </button>
        }
      </mat-form-field>
      <div class="filters">
        <mat-form-field
          ><mat-label>Stock type</mat-label
          ><mat-select [formControl]="stockType"
            ><mat-option value="">All stock</mat-option
            ><mat-option value="old">Old stock</mat-option
            ><mat-option value="new">New stock</mat-option></mat-select
          ></mat-form-field
        >
        <mat-form-field
          ><mat-label>Copy status</mat-label
          ><mat-select [formControl]="status"
            ><mat-option value="">All statuses</mat-option>
            @for (item of statuses; track item.value) {
              <mat-option [value]="item.value">{{ item.label }}</mat-option>
            }
          </mat-select></mat-form-field
        >
        <mat-form-field
          ><mat-label>Category</mat-label
          ><mat-select [formControl]="categoryId"
            ><mat-option value="">All categories</mat-option>
            @for (item of categories(); track item.id) {
              <mat-option [value]="item.id">{{ item.path || item.name }}</mat-option>
            }
          </mat-select></mat-form-field
        >
        <mat-form-field
          ><mat-label>Publisher</mat-label
          ><mat-select [formControl]="publisherId"
            ><mat-option value="">All publishers</mat-option>
            @for (item of publishers(); track item.id) {
              <mat-option [value]="item.id">{{ item.name }}</mat-option>
            }
          </mat-select></mat-form-field
        >
        <mat-form-field
          ><mat-label>Rack</mat-label
          ><mat-select [formControl]="rackId"
            ><mat-option value="">All racks</mat-option>
            @for (item of racks(); track item.id) {
              <mat-option [value]="item.id">{{ item.path }}</mat-option>
            }
          </mat-select></mat-form-field
        >
        <mat-form-field
          ><mat-label>Shelf</mat-label
          ><mat-select [formControl]="shelfId"
            ><mat-option value="">All shelves</mat-option>
            @for (item of shelves(); track item.id) {
              <mat-option [value]="item.id">{{ item.path }}</mat-option>
            }
          </mat-select></mat-form-field
        >
        <mat-form-field
          ><mat-label>Sort books</mat-label
          ><mat-select [formControl]="sort"
            ><mat-option value="relevance">Relevance</mat-option
            ><mat-option value="title">Title A–Z</mat-option
            ><mat-option value="-title">Title Z–A</mat-option
            ><mat-option value="newest">Recently added</mat-option></mat-select
          ></mat-form-field
        >
      </div>
    </section>

    @if (!query.value.trim()) {
      <div class="search-prompt">
        <mat-icon>manage_search</mat-icon>
        <h2>Search the library</h2>
        <p>
          Enter a title, author, author number, ISBN, accession number, publisher, category, rack,
          or shelf.
        </p>
      </div>
    } @else if (error()) {
      <div class="state-panel state-panel--error" role="alert">
        <mat-icon>error</mat-icon>
        <p>{{ error() }}</p>
        <button mat-stroked-button type="button" (click)="load()">Try again</button>
      </div>
    } @else if (loading() && !result()) {
      <div class="state-panel" role="status">
        <mat-icon>search</mat-icon>
        <p>Searching the catalogue…</p>
      </div>
    } @else if (result(); as matches) {
      @if (matches.exactCopy; as copy) {
        <section class="result-section exact-copy" aria-labelledby="exact-copy-heading">
          <div class="section-heading">
            <div>
              <h2 id="exact-copy-heading">Exact accession match</h2>
              <p>Physical copy identified by accession number.</p>
            </div>
          </div>
          <article class="exact-copy-row">
            <div>
              <a class="primary-result" [routerLink]="['/catalogue/copies', copy.id]">{{
                copy.accessionNumber
              }}</a><span>{{ copy.book.title }}</span>
            </div>
            <div>
              <strong>{{ label(copy.status) }}</strong><span>{{
                copy.shelf?.path || 'Unshelved'
              }}</span>
            </div>
            <a mat-stroked-button [routerLink]="['/catalogue/copies', copy.id]">Copy details</a>
          </article>
        </section>
      }

      @if (matches.authors.length) {
        <section class="result-section" aria-labelledby="author-results-heading">
          <div class="section-heading">
            <div>
              <h2 id="author-results-heading">Authors</h2>
              <p>Author profiles and their associated titles.</p>
            </div>
            <span>{{ matches.authors.length }} matches</span>
          </div>
          @for (author of matches.authors; track author.id) {
            <article class="author-result">
              <div class="author-summary">
                <a class="primary-result" [routerLink]="['/authors', author.id]">{{
                  author.name
                }}</a><span
                  >{{ author.authorNumber || 'No author number' }}
                  @if (author.nationality) {
                    · {{ author.nationality }}
                  }</span
                ><span class="author-counts"
                  >{{ author.titles }} titles · {{ author.copies }} physical copies</span
                >
              </div>
              @if (author.description) {
                <p class="author-description">{{ author.description }}</p>
              }
              @if (author.books.length) {
                <ul class="author-books">
                  @for (book of author.books; track book.id) {
                    <li>
                      <a [routerLink]="['/catalogue/books', book.id]">{{ book.title }}</a><span
                        >{{ book.role.toLowerCase() }} · {{ book.editions.length }} editions ·
                        {{ totalCopies(book) }} copies</span
                      >
                    </li>
                  }
                </ul>
              }
            </article>
          }
        </section>
      }

      <section class="result-section" aria-labelledby="book-results-heading">
        <div class="section-heading">
          <div>
            <h2 id="book-results-heading">Books and editions</h2>
            <p>Matching titles, edition identifiers and physical copies.</p>
          </div>
          <span>{{ matches.books.meta.total }} matches</span>
        </div>
        @if (!matches.books.data.length) {
          <div class="search-empty">No books match the current query and filters.</div>
        }
        @for (book of matches.books.data; track book.id) {
          <article class="book-result">
            <div class="book-result-heading">
              <div>
                <a class="primary-result" [routerLink]="['/catalogue/books', book.id]">{{
                  book.title
                }}</a>
                @if (book.subtitle) {
                  <span>{{ book.subtitle }}</span>
                }
                <small
                  >{{
                    book.authors.map((author) => author.name).join(', ') || 'No authors assigned'
                  }}
                  @if (book.category) {
                    · {{ book.category }}
                  }
                </small>
              </div>
              <a mat-button [routerLink]="['/catalogue/books', book.id]">Book details</a>
            </div>
            @for (edition of book.editions; track edition.id) {
              <div class="edition-result">
                <div class="edition-heading">
                  <strong
                    >{{ edition.editionStatement || 'Edition' }}
                    @if (edition.publicationYear) {
                      · {{ edition.publicationYear }}
                    }</strong
                  ><span
                    >{{ edition.isbn13 || edition.isbn10 || 'No ISBN' }}
                    @if (edition.publisher) {
                      · {{ edition.publisher }}
                    }
                  </span>
                </div>
                @if (edition.copies.length) {
                  <div class="copies-wrap">
                    <table class="copies-table">
                      <thead>
                        <tr>
                          <th scope="col">Accession</th>
                          <th scope="col">Status</th>
                          <th scope="col">Stock type</th>
                          <th scope="col">Shelf</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (copy of edition.copies; track copy.id) {
                          <tr>
                            <th scope="row">
                              <a [routerLink]="['/catalogue/copies', copy.id]">{{
                                copy.accessionNumber
                              }}</a>
                            </th>
                            <td>{{ label(copy.status) }}</td>
                            <td>{{ acquisitionLabel(copy.acquisitionType) }}</td>
                            <td>{{ copy.shelf?.path || 'Unshelved' }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                } @else {
                  <p class="no-copies">No physical copies match the selected stock filters.</p>
                }
                @if (edition.copiesTruncated) {
                  <a
                    mat-button
                    [routerLink]="['/catalogue/copies']"
                    [queryParams]="{ editionId: edition.id }"
                    >View all {{ edition.copyCount }} matching copies</a
                  >
                }
              </div>
            }
          </article>
        }
        @if (matches.books.meta.total > 0) {
          <mat-paginator
            [length]="matches.books.meta.total"
            [pageIndex]="page() - 1"
            [pageSize]="pageSize()"
            [pageSizeOptions]="[10, 20, 50]"
            (page)="changePage($event)"
            aria-label="Search book results pages"
          />
        }
      </section>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .search-controls {
        padding-bottom: 12px;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
      .query-field {
        width: min(100%, 900px);
      }
      .filters {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
        gap: 0 12px;
      }
      .filters mat-form-field {
        width: 100%;
      }
      .search-prompt {
        display: grid;
        justify-items: center;
        padding: 72px 20px;
        text-align: center;
        color: var(--mat-sys-on-surface-variant);
      }
      .search-prompt mat-icon {
        width: 44px;
        height: 44px;
        font-size: 44px;
      }
      .search-prompt h2 {
        margin: 14px 0 4px;
        color: var(--mat-sys-on-surface);
        font: var(--mat-sys-title-large);
      }
      .search-prompt p {
        max-width: 70ch;
        margin: 0;
      }
      .result-section {
        margin-top: 26px;
      }
      .section-heading {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 14px;
        margin-bottom: 12px;
      }
      .section-heading h2 {
        margin: 0 0 4px;
        font: var(--mat-sys-title-large);
      }
      .section-heading p,
      .section-heading > span {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
      }
      .exact-copy-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px 24px;
        padding: 14px 0;
        border-block: 1px solid var(--mat-sys-outline-variant);
      }
      .exact-copy-row > div {
        display: grid;
        gap: 3px;
        min-width: 170px;
      }
      .exact-copy-row > div span {
        color: var(--mat-sys-on-surface-variant);
      }
      .primary-result {
        color: var(--mat-sys-primary);
        font-weight: 650;
      }
      .author-result,
      .book-result {
        padding: 16px 0;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }
      .author-summary {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px 16px;
      }
      .author-counts,
      .author-summary > span {
        color: var(--mat-sys-on-surface-variant);
      }
      .author-description {
        max-width: 85ch;
        margin: 8px 0;
        white-space: pre-line;
      }
      .author-books {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 4px 20px;
        margin: 8px 0 0;
        padding-left: 20px;
      }
      .author-books li {
        padding: 3px 0;
      }
      .author-books li span {
        display: block;
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
      }
      .book-result-heading {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 14px;
      }
      .book-result-heading > div {
        display: grid;
        gap: 4px;
      }
      .book-result-heading small {
        color: var(--mat-sys-on-surface-variant);
      }
      .edition-result {
        margin: 13px 0 0 12px;
        border-left: 2px solid var(--mat-sys-outline-variant);
        padding-left: 12px;
      }
      .edition-heading {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 14px;
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
      }
      .edition-heading strong {
        color: var(--mat-sys-on-surface);
      }
      .copies-wrap {
        overflow-x: auto;
        margin-top: 8px;
      }
      .copies-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
      }
      .copies-table th,
      .copies-table td {
        padding: 7px 9px;
        border-top: 1px solid var(--mat-sys-outline-variant);
        white-space: nowrap;
      }
      .copies-table thead th {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-label-small);
      }
      .no-copies,
      .search-empty {
        padding: 10px 0;
        color: var(--mat-sys-on-surface-variant);
      }
      @media (max-width: 650px) {
        .filters {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0 8px;
        }
        .author-summary {
          align-items: flex-start;
          flex-direction: column;
          gap: 3px;
        }
      }
    `,
  ],
})
export class SearchPage {
  private readonly route = inject(ActivatedRoute);
  private readonly searchService = inject(SearchService);
  private readonly catalogue = inject(CatalogueService);
  private readonly locations = inject(LocationsService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly statuses = STATUS_OPTIONS;
  protected readonly query = new FormControl('', { nonNullable: true });
  protected readonly stockType = new FormControl<SearchFilters['stockType']>('', {
    nonNullable: true,
  });
  protected readonly status = new FormControl<SearchFilters['status']>('', { nonNullable: true });
  protected readonly categoryId = new FormControl('', { nonNullable: true });
  protected readonly publisherId = new FormControl('', { nonNullable: true });
  protected readonly shelfId = new FormControl('', { nonNullable: true });
  protected readonly rackId = new FormControl('', { nonNullable: true });
  protected readonly sort = new FormControl<SearchFilters['sort']>('relevance', {
    nonNullable: true,
  });
  protected readonly categories = signal<LookupOption[]>([]);
  protected readonly publishers = signal<LookupOption[]>([]);
  protected readonly shelves = signal<{ id: string; path: string; label: string }[]>([]);
  protected readonly racks = signal<{ id: string; path: string }[]>([]);
  protected readonly result = signal<SearchResponse | null>(null);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    const initialQuery = this.route.snapshot.queryParamMap.get('q');
    if (initialQuery) this.query.setValue(initialQuery, { emitEvent: false });
    forkJoin({
      categories: this.catalogue.categories(),
      publishers: this.catalogue.publishers(),
      shelves: this.locations.shelves(),
      tree: this.locations.tree().pipe(catchError(() => of({ data: [] as LocationBuilding[] }))),
    }).subscribe({
      next: (lookups) => {
        this.categories.set(lookups.categories.data);
        this.publishers.set(lookups.publishers.data);
        this.shelves.set(lookups.shelves.data);
        this.racks.set(
          lookups.tree.data.flatMap((building) =>
            building.floors.flatMap((floor) =>
              floor.rooms.flatMap((room) =>
                room.racks.map((rack) => ({
                  id: rack.id,
                  path: [building.code, floor.code, room.code, rack.code].join(' / '),
                })),
              ),
            ),
          ),
        );
      },
      error: (error: unknown) => this.error.set(toApiError(error).message),
    });
    this.query.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.page.set(1);
        this.load();
      });
    for (const control of [
      this.stockType,
      this.status,
      this.categoryId,
      this.publisherId,
      this.shelfId,
      this.rackId,
      this.sort,
    ]) {
      control.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        this.page.set(1);
        this.load();
      });
    }
    if (initialQuery) this.load();
  }

  protected load(): void {
    const q = this.query.value.trim();
    if (!q) {
      this.result.set(null);
      this.error.set(null);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.searchService
      .search({
        q,
        page: this.page(),
        pageSize: this.pageSize(),
        sort: this.sort.value,
        categoryId: this.categoryId.value,
        publisherId: this.publisherId.value,
        stockType: this.stockType.value,
        status: this.status.value,
        shelfId: this.shelfId.value,
        rackId: this.rackId.value,
      })
      .subscribe({
        next: (result) => {
          this.result.set(result);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(toApiError(error).message);
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
    return value === 'LEGACY_OLD_STOCK'
      ? 'Old stock'
      : value === 'PURCHASED_NEW'
        ? 'New stock'
        : this.label(value);
  }

  protected totalCopies(book: SearchResponse['authors'][number]['books'][number]): number {
    return book.editions.reduce((sum, edition) => sum + edition.copies.holdings, 0);
  }
}

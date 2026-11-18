import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { toApiError } from '../../core/api/api';
import { Permissions } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { PageHeader } from '../../shared/ui/page-header';
import { BookRow, CatalogueService } from './catalogue.service';

@Component({
  selector: 'app-books-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header title="Books" description="Find a book or add one to your library.">
      @if (canWrite()) {
        <a mat-flat-button routerLink="/catalogue/books/new"><mat-icon>add</mat-icon> Add book</a>
      }
      <a mat-stroked-button routerLink="/catalogue/copies"
        ><mat-icon>inventory_2</mat-icon> Book copies</a
      >
    </app-page-header>

    <section class="catalogue-toolbar" aria-label="Catalogue search">
      <mat-form-field class="catalogue-search">
        <mat-label>Search by title, author, ISBN or copy number</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput [formControl]="search" autocomplete="off" />
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
      <span class="catalogue-count">{{ total() }} {{ total() === 1 ? 'title' : 'titles' }}</span>
    </section>

    @if (error()) {
      <div class="state-panel state-panel--error" role="alert">
        <mat-icon>error</mat-icon>
        <p>{{ error() }}</p>
        <button mat-stroked-button type="button" (click)="load()">Try again</button>
      </div>
    } @else if (loading() && rows().length === 0) {
      <div class="state-panel" role="status">
        <mat-icon>menu_book</mat-icon>
        <p>Loading catalogue…</p>
      </div>
    } @else if (rows().length === 0) {
      <div class="state-panel">
        <mat-icon>menu_book</mat-icon>
        <h2>{{ search.value ? 'No matching books' : 'No books added yet' }}</h2>
        <p>
          {{
            search.value
              ? 'Try another title, author, ISBN or copy number.'
              : 'Add your first book to get started.'
          }}
        </p>
        @if (!search.value && canWrite()) {
          <a mat-flat-button routerLink="/catalogue/books/new"
            ><mat-icon>add</mat-icon> Add a book</a
          >
        }
      </div>
    } @else {
      <div class="catalogue-table-wrap" [attr.aria-busy]="loading()">
        <table class="catalogue-table">
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Authors</th>
              <th scope="col">Edition / ISBN</th>
              <th scope="col">Category</th>
              <th scope="col">Copies</th>
            </tr>
          </thead>
          <tbody>
            @for (book of rows(); track book.id) {
              <tr>
                <th scope="row">
                  <a class="catalogue-title" [routerLink]="['/catalogue/books', book.id]">{{
                    book.title
                  }}</a>
                  @if (book.subtitle) {
                    <span class="catalogue-secondary">{{ book.subtitle }}</span>
                  }
                </th>
                <td>{{ book.authors.join(', ') || 'Not assigned' }}</td>
                <td>
                  {{ book.editions }} {{ book.editions === 1 ? 'edition' : 'editions'
                  }}<span class="catalogue-secondary">{{
                    book.isbns.join(', ') || 'No ISBN'
                  }}</span>
                </td>
                <td>{{ book.category || 'Uncategorised' }}</td>
                <td>
                  <strong>{{ book.copies.holdings }}</strong><span class="catalogue-secondary"
                    >{{ book.copies.available }} available</span
                  >
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
        aria-label="Book catalogue pages"
      />
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .catalogue-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }
      .catalogue-search {
        width: min(100%, 560px);
      }
      .catalogue-count {
        color: var(--mat-sys-on-surface-variant);
        white-space: nowrap;
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
        padding: 14px 16px;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
        vertical-align: top;
      }
      thead th {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-label-medium);
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
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
        margin-top: 3px;
      }
      @media (max-width: 700px) {
        .catalogue-toolbar {
          align-items: flex-start;
          flex-direction: column;
          gap: 0;
        }
        .catalogue-search {
          width: 100%;
        }
        th,
        td {
          padding: 12px;
        }
      }
    `,
  ],
})
export class BooksPage {
  private readonly catalogue = inject(CatalogueService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly rows = signal<BookRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly canWrite = computed(() => {
    this.auth.user();
    return this.auth.hasPermission(Permissions.CATALOGUE_WRITE);
  });

  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.page.set(1);
        this.load();
      });
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.catalogue.books(this.page(), this.pageSize(), this.search.value).subscribe({
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
}

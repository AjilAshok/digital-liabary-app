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
import { AuthService } from '../../core/auth/auth.service';
import { Permissions } from '../../core/auth/auth.models';
import { PageHeader } from '../../shared/ui/page-header';
import { AuthorRow, AuthorsService } from './authors.service';

@Component({
  selector: 'app-authors-page',
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
    <app-page-header
      title="Authors"
      description="Author records, linked titles and physical-copy holdings."
    >
      @if (canWrite()) {
        <a mat-flat-button routerLink="/authors/new"><mat-icon>person_add</mat-icon> Add author</a>
      }
    </app-page-header>

    <section class="author-toolbar" aria-label="Search authors">
      <mat-form-field class="author-search">
        <mat-label>Search author name or number</mat-label>
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
      <span class="author-count">{{ total() }} {{ total() === 1 ? 'author' : 'authors' }}</span>
    </section>

    @if (error()) {
      <div class="state-panel state-panel--error" role="alert">
        <mat-icon>error</mat-icon>
        <p>{{ error() }}</p>
        <button mat-stroked-button type="button" (click)="load()">Try again</button>
      </div>
    } @else if (loading() && !rows().length) {
      <div class="state-panel" role="status">
        <mat-icon>groups</mat-icon>
        <p>Loading authors…</p>
      </div>
    } @else if (!rows().length) {
      <div class="state-panel">
        <mat-icon>groups</mat-icon>
        <h2>{{ search.value ? 'No matching authors' : 'No authors yet' }}</h2>
        <p>
          {{
            search.value
              ? 'Try another name or author number.'
              : 'Add an author to link them to catalogue titles.'
          }}
        </p>
      </div>
    } @else {
      <div class="author-table-wrap" [attr.aria-busy]="loading()">
        <table class="author-table">
          <thead>
            <tr>
              <th scope="col">Author</th>
              <th scope="col">Author number</th>
              <th scope="col">Titles</th>
              <th scope="col">Physical copies</th>
            </tr>
          </thead>
          <tbody>
            @for (author of rows(); track author.id) {
              <tr>
                <th scope="row">
                  <a class="author-name" [routerLink]="['/authors', author.id]">{{
                    author.name
                  }}</a>
                </th>
                <td>{{ author.authorNumber || 'Not assigned' }}</td>
                <td>{{ author.titles }}</td>
                <td>{{ author.copies }}</td>
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
        aria-label="Author directory pages"
      />
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .author-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }
      .author-search {
        width: min(100%, 560px);
      }
      .author-count {
        color: var(--mat-sys-on-surface-variant);
        white-space: nowrap;
      }
      .author-table-wrap {
        overflow-x: auto;
        border-block: 1px solid var(--mat-sys-outline-variant);
      }
      .author-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
      }
      th,
      td {
        padding: 14px 16px;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
      thead th {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-label-medium);
      }
      tbody tr:last-child th,
      tbody tr:last-child td {
        border-bottom: 0;
      }
      .author-name {
        color: var(--mat-sys-primary);
        font-weight: 600;
      }
      @media (max-width: 650px) {
        .author-toolbar {
          align-items: flex-start;
          flex-direction: column;
          gap: 0;
        }
        .author-search {
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
export class AuthorsPage {
  private readonly authors = inject(AuthorsService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly rows = signal<AuthorRow[]>([]);
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
    this.authors.list(this.page(), this.pageSize(), this.search.value).subscribe({
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

import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { toApiError } from '../../core/api/api';
import { AuthService } from '../../core/auth/auth.service';
import { Permissions } from '../../core/auth/auth.models';
import { PageHeader } from '../../shared/ui/page-header';
import { AuthorDetails, AuthorsService } from './authors.service';

@Component({
  selector: 'app-author-details-page',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error() && !author()) {
      <div class="state-panel state-panel--error" role="alert">
        <mat-icon>error</mat-icon>
        <h1>Could not load author</h1>
        <p>{{ error() }}</p>
        <a mat-stroked-button routerLink="/authors">Back to authors</a>
      </div>
    } @else if (author(); as record) {
      <app-page-header
        [title]="record.name"
        [description]="
          record.authorNumber ? 'Author number ' + record.authorNumber : 'Author profile'
        "
      >
        <a mat-stroked-button routerLink="/authors"><mat-icon>arrow_back</mat-icon> Authors</a>
        @if (canWrite()) {
          <a mat-flat-button [routerLink]="['/authors', record.id, 'edit']"
            ><mat-icon>edit</mat-icon> Edit author</a
          >
        }
      </app-page-header>
      @if (error()) {
        <p class="author-error" role="alert">{{ error() }}</p>
      }

      <section class="author-profile" aria-label="Author profile">
        <div>
          <h2>Author number</h2>
          <p>{{ record.authorNumber || 'Not assigned' }}</p>
        </div>
        <div>
          <h2>Nationality</h2>
          <p>{{ record.nationality || 'Not recorded' }}</p>
        </div>
        <div>
          <h2>Date of birth</h2>
          <p>
            {{
              record.dateOfBirth ? (record.dateOfBirth | date: 'longDate' : 'UTC') : 'Not recorded'
            }}
          </p>
        </div>
        <div class="profile-counts">
          <span
            ><strong>{{ record.titles }}</strong>
            {{ record.titles === 1 ? 'title' : 'titles' }}</span
          ><span
            ><strong>{{ record.copies }}</strong> physical
            {{ record.copies === 1 ? 'copy' : 'copies' }}</span
          >
        </div>
      </section>
      @if (record.description) {
        <section class="author-description">
          <h2>Description</h2>
          <p>{{ record.description }}</p>
        </section>
      }

      <section class="author-books" aria-labelledby="author-books-heading">
        <div class="books-heading">
          <div>
            <h2 id="author-books-heading">Associated books</h2>
            <p>Titles linked through the book-author relationship.</p>
          </div>
          <span>{{ record.titles }} titles · {{ record.copies }} copies</span>
        </div>
        @if (!record.books.length) {
          <div class="author-empty">This author is not linked to any active book titles.</div>
        }
        @for (book of record.books; track book.id) {
          <article class="author-book">
            <div class="book-title-block">
              <a class="book-title" [routerLink]="['/catalogue/books', book.id]">{{
                book.title
              }}</a>
              @if (book.subtitle) {
                <span>{{ book.subtitle }}</span>
              }
              <small>{{ book.role.toLowerCase() }}</small>
            </div>
            <div class="book-editions">
              @for (edition of book.editions; track edition.id) {
                <div>
                  <span
                    >{{ edition.editionStatement || 'Edition' }}
                    @if (edition.publicationYear) {
                      · {{ edition.publicationYear }}
                    }</span
                  ><small
                    >{{ edition.isbn13 || 'No ISBN' }} · {{ edition.copies.holdings }}
                    {{ edition.copies.holdings === 1 ? 'copy' : 'copies' }},
                    {{ edition.copies.available }} available</small
                  >
                </div>
              }
              @if (!book.editions.length) {
                <span>No active editions</span>
              }
            </div>
            <div class="book-total">
              <strong>{{ book.copies.holdings }}</strong><span>copies</span>
            </div>
          </article>
        }
      </section>
    } @else {
      <div class="state-panel" role="status">
        <mat-icon>person</mat-icon>
        <p>Loading author…</p>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .author-error {
        padding: 12px 14px;
        border-left: 4px solid var(--mat-sys-error);
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .author-profile {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 18px 28px;
        padding: 18px 0;
        border-block: 1px solid var(--mat-sys-outline-variant);
      }
      .author-profile h2,
      .author-description h2 {
        margin: 0 0 6px;
        font: var(--mat-sys-title-medium);
      }
      .author-profile p {
        margin: 0;
      }
      .profile-counts {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px 24px;
        grid-column: 1 / -1;
        padding-top: 12px;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }
      .profile-counts strong {
        font: var(--mat-sys-headline-small);
      }
      .author-description {
        max-width: 90ch;
        padding: 20px 0;
        white-space: pre-line;
      }
      .author-description p {
        margin: 0;
      }
      .author-books {
        margin-top: 18px;
      }
      .books-heading {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 18px;
      }
      .books-heading h2 {
        margin: 0 0 4px;
        font: var(--mat-sys-title-large);
      }
      .books-heading p,
      .books-heading > span {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
      }
      .author-book {
        display: grid;
        grid-template-columns: minmax(180px, 1fr) minmax(240px, 1.4fr) 80px;
        gap: 18px;
        align-items: center;
        padding: 16px 0;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }
      .book-title {
        color: var(--mat-sys-primary);
        font-weight: 600;
      }
      .book-title-block > span,
      .book-title-block small,
      .book-editions small {
        display: block;
        margin-top: 4px;
        color: var(--mat-sys-on-surface-variant);
      }
      .book-editions > div {
        padding: 3px 0;
      }
      .book-total {
        display: grid;
        text-align: right;
      }
      .book-total strong {
        font: var(--mat-sys-title-large);
      }
      .book-total span {
        color: var(--mat-sys-on-surface-variant);
      }
      .author-empty {
        padding: 18px 0;
        border-top: 1px solid var(--mat-sys-outline-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      @media (max-width: 700px) {
        .author-profile {
          grid-template-columns: 1fr 1fr;
        }
        .author-book {
          grid-template-columns: minmax(0, 1fr) 60px;
        }
        .book-editions {
          grid-column: 1 / -1;
          grid-row: 2;
        }
        .book-total {
          grid-column: 2;
          grid-row: 1;
        }
        .books-heading {
          flex-direction: column;
        }
      }
    `,
  ],
})
export class AuthorDetailsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly authors = inject(AuthorsService);
  private readonly auth = inject(AuthService);
  protected readonly author = signal<AuthorDetails | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly canWrite = computed(() => {
    this.auth.user();
    return this.auth.hasPermission(Permissions.CATALOGUE_WRITE);
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('authorId');
    if (!id) {
      this.error.set('Author id is missing.');
      return;
    }
    this.authors.get(id).subscribe({
      next: (author) => this.author.set(author),
      error: (err: unknown) => this.error.set(toApiError(err).message),
    });
  }
}

import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, forkJoin } from 'rxjs';
import { toApiError } from '../../core/api/api';
import { PageHeader } from '../../shared/ui/page-header';
import {
  BookInput,
  CatalogueService,
  Edition,
  EditionInput,
  LookupOption,
} from './catalogue.service';

type FormMode = 'create' | 'edit-book' | 'add-edition' | 'edit-edition';
interface DuplicateIsbnMatch {
  editionId: string;
  bookId: string;
  title: string;
  editionStatement: string | null;
}
interface DuplicateTitleMatch {
  bookId: string;
  title: string;
  authors: string[];
  editions: number;
}

@Component({
  selector: 'app-book-form-page',
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
    <app-page-header [title]="heading()" [description]="description()">
      @if (mode === 'create') {
        <a mat-stroked-button routerLink="/scanner/cover"
          ><mat-icon>document_scanner</mat-icon> Read from cover</a
        >
      }
      <a mat-stroked-button [routerLink]="backLink()"><mat-icon>arrow_back</mat-icon> Back</a>
    </app-page-header>

    @if (error()) {
      <div class="catalogue-error" role="alert">
        <mat-icon>error</mat-icon><span>{{ error() }}</span>
      </div>
    }
    @if (duplicateIsbn().length) {
      <section class="catalogue-warning" aria-live="polite">
        <strong>This ISBN is already catalogued.</strong
        ><span
          >Register another physical copy of the existing edition instead of duplicating its
          record.</span
        >
        @for (match of duplicateIsbn(); track match.editionId) {
          <div class="duplicate-match">
            <a [routerLink]="['/catalogue/books', match.bookId]">{{ match.title }}</a><span>{{
              match.editionStatement || 'Edition'
            }}</span
            ><a
              mat-flat-button
              [routerLink]="['/catalogue/editions', match.editionId, 'copies', 'new']"
              [queryParams]="{ bookId: match.bookId }"
              >Register copies</a
            >
          </div>
        }
      </section>
    }
    @if (duplicateTitles().length) {
      <section class="catalogue-warning" aria-live="polite">
        <strong>A title with this name already exists.</strong
        ><span
          >Use the existing record for additional editions or copies. Confirm only if this is a
          genuinely different work.</span
        >
        @for (match of duplicateTitles(); track match.bookId) {
          <div class="duplicate-match">
            <a [routerLink]="['/catalogue/books', match.bookId]">{{ match.title }}</a><span
              >{{ match.authors.join(', ') || 'No authors' }} · {{ match.editions }} editions</span
            ><a mat-button [routerLink]="['/catalogue/books', match.bookId, 'editions', 'new']"
              >Add edition</a
            >
          </div>
        }
        <button mat-stroked-button type="button" (click)="confirmDifferentWork()">
          This is a different work
        </button>
      </section>
    }

    @if (loading()) {
      <div class="state-panel" role="status">
        <mat-icon>menu_book</mat-icon>
        <p>Loading book details…</p>
      </div>
    } @else {
      <form class="catalogue-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (mode !== 'add-edition' && mode !== 'edit-edition') {
          <section class="catalogue-form-section">
            <h2>Title details</h2>
            <div class="catalogue-form-grid">
              <mat-form-field class="wide"
                ><mat-label>Title</mat-label
                ><input matInput formControlName="title" required maxlength="300" /><mat-error
                  >Enter a title (up to 300 characters).</mat-error
                ></mat-form-field
              >
              <mat-form-field
                ><mat-label>Subtitle</mat-label
                ><input matInput formControlName="subtitle" maxlength="300"
              /></mat-form-field>
              <mat-form-field
                ><mat-label>Original language</mat-label
                ><input matInput formControlName="originalLanguage" maxlength="40"
              /></mat-form-field>
              <mat-form-field
                ><mat-label>Category</mat-label
                ><mat-select formControlName="categoryId"
                  ><mat-option [value]="null">Uncategorised</mat-option>
                  @for (item of categories(); track item.id) {
                    <mat-option [value]="item.id">{{ item.path || item.name }}</mat-option>
                  }
                </mat-select></mat-form-field
              >
              <mat-form-field class="wide"
                ><mat-label>Description</mat-label
                ><textarea
                  matInput
                  rows="3"
                  formControlName="description"
                  maxlength="5000"
                ></textarea>
              </mat-form-field>
              <mat-form-field class="wide"
                ><mat-label>Find authors</mat-label
                ><input matInput [formControl]="authorSearch" placeholder="Name or author number"
              /></mat-form-field>
              <mat-form-field class="wide"
                ><mat-label>Authors</mat-label
                ><mat-select formControlName="authorIds" multiple
                  ><mat-select-trigger>{{ selectedAuthorsLabel() }}</mat-select-trigger>
                  @for (author of authors(); track author.id) {
                    <mat-option [value]="author.id"
                      >{{ author.name
                      }}{{ author.authorNumber ? ' · ' + author.authorNumber : '' }}</mat-option
                    >
                  }</mat-select
                ><mat-hint>Select one or more existing authors.</mat-hint></mat-form-field
              >
            </div>
          </section>
        }

        @if (mode !== 'edit-book') {
          <section class="catalogue-form-section">
            <h2>Edition details</h2>
            <div class="catalogue-form-grid">
              <mat-form-field
                ><mat-label>ISBN-10 or ISBN-13</mat-label
                ><input
                  matInput
                  formControlName="isbn"
                  maxlength="20"
                  (blur)="checkIsbn()"
                /><mat-hint>Check digit is validated when saved.</mat-hint></mat-form-field
              >
              <mat-form-field
                ><mat-label>Edition statement</mat-label
                ><input
                  matInput
                  formControlName="editionStatement"
                  maxlength="120"
                  placeholder="2nd edition"
              /></mat-form-field>
              <mat-form-field
                ><mat-label>Find publisher</mat-label
                ><input matInput [formControl]="publisherSearch" placeholder="Publisher name"
              /></mat-form-field>
              <mat-form-field
                ><mat-label>Publisher</mat-label
                ><mat-select formControlName="publisherId"
                  ><mat-option [value]="null">Not recorded</mat-option>
                  @for (item of publishers(); track item.id) {
                    <mat-option [value]="item.id">{{ item.name }}</mat-option>
                  }
                </mat-select></mat-form-field
              >
              <mat-form-field
                ><mat-label>Publication year</mat-label
                ><input
                  matInput
                  type="number"
                  formControlName="publicationYear"
                  min="1000"
                  [max]="maxYear"
                /><mat-error>Enter a valid publication year.</mat-error></mat-form-field
              >
              <mat-form-field
                ><mat-label>Language</mat-label
                ><input matInput formControlName="language" maxlength="40"
              /></mat-form-field>
              <mat-form-field
                ><mat-label>Page count</mat-label
                ><input matInput type="number" formControlName="pageCount" min="1" /><mat-error
                  >Page count must be at least one.</mat-error
                ></mat-form-field
              >
              <mat-form-field
                ><mat-label>Format</mat-label
                ><input matInput formControlName="format" maxlength="40" placeholder="Hardcover"
              /></mat-form-field>
            </div>
            @if (mode === 'edit-edition' && editingEdition()) {
              <div class="cover-controls">
                @if (editingEdition()!.hasCover) {
                  <img class="edition-cover" [src]="coverUrl" alt="Current edition cover" /><button
                    mat-stroked-button
                    type="button"
                    (click)="removeCover()"
                    [disabled]="saving()"
                  >
                    Remove cover
                  </button>
                }
                <label class="cover-picker"
                  >{{ editingEdition()!.hasCover ? 'Replace cover' : 'Upload cover'
                  }}<input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    (change)="selectCover($event)"
                /></label>
                @if (coverFile()) {
                  <span>{{ coverFile()!.name }}</span>
                }
                <small>JPEG, PNG or WebP; maximum 2 MB.</small>
              </div>
            }
          </section>
        }

        @if (!loading()) {
          <div class="catalogue-form-actions">
            <button mat-flat-button type="submit" [disabled]="saving()">
              <mat-icon>{{ saving() ? 'hourglass_top' : 'save' }}</mat-icon>{{
                saving() ? 'Saving…' : 'Save'
              }}
            </button>
            @if (mode === 'create') {
              <a mat-button routerLink="/catalogue/books">Cancel</a>
            } @else if (bookId) {
              <a mat-button [routerLink]="['/catalogue/books', bookId]">Cancel</a>
            }
          </div>
        }
      </form>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .catalogue-error,
      .catalogue-warning {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 16px;
        margin-bottom: 20px;
        border-left: 4px solid var(--mat-sys-error);
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .catalogue-error mat-icon {
        flex: 0 0 auto;
      }
      .catalogue-warning {
        flex-direction: column;
        border-color: var(--status-warning);
        background: color-mix(in srgb, var(--status-warning) 12%, var(--mat-sys-surface));
        color: var(--mat-sys-on-surface);
      }
      .duplicate-match {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        width: 100%;
        padding-top: 8px;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }
      .duplicate-match span {
        flex: 1;
        color: var(--mat-sys-on-surface-variant);
      }
      .catalogue-form {
        max-width: 1000px;
      }
      .catalogue-form-section {
        border-top: 1px solid var(--mat-sys-outline-variant);
        padding: 20px 0 8px;
        margin-bottom: 8px;
      }
      .catalogue-form-section h2 {
        margin: 0 0 18px;
        font: var(--mat-sys-title-large);
      }
      .catalogue-form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px 18px;
      }
      .catalogue-form-grid .wide {
        grid-column: 1 / -1;
      }
      .catalogue-form-grid mat-form-field {
        width: 100%;
      }
      .catalogue-form-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 0 28px;
      }
      .cover-controls {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        padding: 8px 0 16px;
      }
      .cover-picker {
        display: inline-flex;
        cursor: pointer;
        align-items: center;
        min-height: 40px;
        padding: 0 14px;
        border: 1px solid var(--mat-sys-outline);
        border-radius: 4px;
      }
      .cover-picker input {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
      }
      .cover-picker:focus-within {
        outline: 2px solid var(--mat-sys-primary);
        outline-offset: 2px;
      }
      .cover-controls small {
        width: 100%;
        color: var(--mat-sys-on-surface-variant);
      }
      .edition-cover {
        width: 76px;
        height: 104px;
        object-fit: cover;
        border: 1px solid var(--mat-sys-outline-variant);
      }
      @media (max-width: 650px) {
        .catalogue-form-grid {
          grid-template-columns: 1fr;
        }
        .catalogue-form-grid .wide {
          grid-column: auto;
        }
      }
    `,
  ],
})
export class BookFormPage {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly catalogue = inject(CatalogueService);
  protected readonly mode = this.route.snapshot.data['mode'] as FormMode;
  protected readonly bookId =
    this.route.snapshot.paramMap.get('bookId') ?? this.route.snapshot.queryParamMap.get('bookId');
  private readonly editionId = this.route.snapshot.paramMap.get('editionId');
  protected readonly maxYear = new Date().getFullYear() + 1;
  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(300)]],
    subtitle: [''],
    description: [''],
    originalLanguage: [''],
    categoryId: this.fb.control<string | null>(null),
    authorIds: this.fb.nonNullable.control<string[]>([]),
    isbn: [''],
    editionStatement: [''],
    publisherId: this.fb.control<string | null>(null),
    publicationYear: this.fb.control<number | null>(null, [
      Validators.min(1000),
      Validators.max(this.maxYear),
    ]),
    language: [''],
    pageCount: this.fb.control<number | null>(null, Validators.min(1)),
    format: [''],
  });
  protected readonly authorSearch = new FormControl('', { nonNullable: true });
  protected readonly publisherSearch = new FormControl('', { nonNullable: true });
  protected readonly authors = signal<LookupOption[]>([]);
  protected readonly publishers = signal<LookupOption[]>([]);
  protected readonly categories = signal<LookupOption[]>([]);
  protected readonly editingEdition = signal<Edition | null>(null);
  protected readonly duplicateIsbn = signal<DuplicateIsbnMatch[]>([]);
  protected readonly duplicateTitles = signal<DuplicateTitleMatch[]>([]);
  protected readonly coverFile = signal<File | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly coverUrl = this.editionId ? `/api/v1/editions/${this.editionId}/cover` : '';
  private confirmNewTitle = false;

  constructor() {
    this.authorSearch.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((search) => this.loadAuthors(search));
    this.publisherSearch.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((search) => this.loadPublishers(search));
    forkJoin({
      authors: this.catalogue.authors(),
      publishers: this.catalogue.publishers(),
      categories: this.catalogue.categories(),
    }).subscribe({
      next: (lookups) => {
        this.authors.set(lookups.authors.data);
        this.publishers.set(lookups.publishers.data);
        this.categories.set(lookups.categories.data);
        const scannedIsbn = this.route.snapshot.queryParamMap.get('isbn');
        if (this.mode === 'create' && scannedIsbn) this.form.controls.isbn.setValue(scannedIsbn);
        if (
          this.mode === 'edit-book' ||
          this.mode === 'add-edition' ||
          this.mode === 'edit-edition'
        )
          this.loadBook();
        else this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(toApiError(err).message);
        this.loading.set(false);
      },
    });
  }

  protected heading(): string {
    return this.mode === 'create'
      ? 'Add book'
      : this.mode === 'edit-book'
        ? 'Edit book'
        : this.mode === 'add-edition'
          ? 'Add edition'
          : 'Edit edition';
  }

  protected description(): string {
    return this.mode === 'create'
      ? 'Create a title and its first edition. Physical copies are registered separately.'
      : 'Update catalogue metadata. Changes are saved to the library catalogue.';
  }

  protected backLink(): string[] {
    return this.bookId ? ['/catalogue/books', this.bookId] : ['/catalogue/books'];
  }

  protected selectedAuthorsLabel(): string {
    const ids = this.form.controls.authorIds.value;
    return (
      this.authors()
        .filter((author) => ids.includes(author.id))
        .map((author) => author.name)
        .join(', ') || 'Select authors'
    );
  }

  protected checkIsbn(): void {
    const isbn = this.form.controls.isbn.value.trim();
    this.duplicateIsbn.set([]);
    if (!isbn || this.mode === 'edit-book') return;
    this.catalogue.lookupIsbn(isbn).subscribe({
      next: (result) =>
        this.duplicateIsbn.set(
          result.matches.filter((match) => match.editionId !== this.editionId),
        ),
      error: () => this.duplicateIsbn.set([]),
    });
  }

  protected confirmDifferentWork(): void {
    this.confirmNewTitle = true;
    this.duplicateTitles.set([]);
    this.save();
  }

  protected selectCover(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file && file.size > 2 * 1024 * 1024) {
      this.error.set('Cover image must be no larger than 2 MB.');
      input.value = '';
      return;
    }
    this.coverFile.set(file);
    this.error.set(null);
  }

  protected removeCover(): void {
    if (!this.editionId) return;
    this.saving.set(true);
    this.catalogue.removeCover(this.editionId).subscribe({
      next: () => {
        this.editingEdition.update((edition) =>
          edition ? { ...edition, hasCover: false } : edition,
        );
        this.saving.set(false);
      },
      error: (err: unknown) => {
        this.error.set(toApiError(err).message);
        this.saving.set(false);
      },
    });
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const values = this.form.getRawValue();
    const book: BookInput = {
      title: values.title.trim(),
      subtitle: values.subtitle.trim() || null,
      description: values.description.trim() || null,
      originalLanguage: values.originalLanguage.trim() || null,
      categoryId: values.categoryId,
      authors: values.authorIds.map((authorId) => ({ authorId, role: 'AUTHOR' as const })),
    };
    const edition: EditionInput = {
      isbn: values.isbn.trim() || null,
      editionStatement: values.editionStatement.trim() || null,
      publisherId: values.publisherId,
      publicationYear: values.publicationYear,
      language: values.language.trim() || null,
      pageCount: values.pageCount,
      format: values.format.trim() || null,
    };

    if (this.mode === 'create') {
      this.catalogue.createBook(book, edition, this.confirmNewTitle).subscribe({
        next: (created) => this.finishSave(created.editions[0]?.id ?? null, created.id),
        error: (err: unknown) => this.handleSaveError(err),
      });
    } else if (this.mode === 'edit-book' && this.bookId) {
      this.catalogue.updateBook(this.bookId, book).subscribe({
        next: (updated) => this.finishSave(null, updated.id),
        error: (err: unknown) => this.handleSaveError(err),
      });
    } else if (this.mode === 'add-edition' && this.bookId) {
      this.catalogue.addEdition(this.bookId, edition).subscribe({
        next: (created) => this.finishSave(created.id, created.bookId),
        error: (err: unknown) => this.handleSaveError(err),
      });
    } else if (this.mode === 'edit-edition' && this.editionId) {
      this.catalogue.updateEdition(this.editionId, edition).subscribe({
        next: (updated) => this.finishSave(updated.id, updated.bookId),
        error: (err: unknown) => this.handleSaveError(err),
      });
    }
  }

  private loadBook(): void {
    if (!this.bookId) {
      this.error.set('Book record not found.');
      this.loading.set(false);
      return;
    }
    this.catalogue.book(this.bookId).subscribe({
      next: (book) => {
        this.form.patchValue({
          title: book.title,
          subtitle: book.subtitle ?? '',
          description: book.description ?? '',
          originalLanguage: book.originalLanguage ?? '',
          categoryId: book.category?.id ?? null,
          authorIds: book.authors.map((author) => author.id),
        });
        const missingAuthors = book.authors.filter(
          (author) => !this.authors().some((option) => option.id === author.id),
        );
        if (missingAuthors.length)
          this.authors.update((options) => [
            ...options,
            ...missingAuthors.map((author) => ({
              id: author.id,
              name: author.name,
              authorNumber: author.authorNumber,
            })),
          ]);
        if (this.mode === 'edit-edition') {
          const edition = book.editions.find((item) => item.id === this.editionId);
          if (!edition) {
            this.error.set('Edition not found.');
            this.loading.set(false);
            return;
          }
          this.editingEdition.set(edition);
          if (
            edition.publisher &&
            !this.publishers().some((publisher) => publisher.id === edition.publisher?.id)
          )
            this.publishers.update((options) => [
              ...options,
              { id: edition.publisher!.id, name: edition.publisher!.name },
            ]);
          this.form.patchValue({
            isbn: edition.isbn13 ?? edition.isbn10 ?? '',
            editionStatement: edition.editionStatement ?? '',
            publisherId: edition.publisher?.id ?? null,
            publicationYear: edition.publicationYear,
            language: edition.language ?? '',
            pageCount: edition.pageCount,
            format: edition.format ?? '',
          });
        }
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(toApiError(err).message);
        this.loading.set(false);
      },
    });
  }

  private finishSave(editionId: string | null, bookId: string): void {
    const file = this.coverFile();
    if (file && editionId) {
      this.catalogue.uploadCover(editionId, file).subscribe({
        next: () => {
          void this.router.navigate(['/catalogue/books', bookId]);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.error.set(toApiError(err).message);
        },
      });
      return;
    }
    void this.router.navigate(['/catalogue/books', bookId]);
  }

  private handleSaveError(err: unknown): void {
    const apiError = toApiError(err);
    this.saving.set(false);
    this.error.set(apiError.message);
    const details = apiError.details as { matches?: unknown[] } | undefined;
    if (apiError.code === 'POSSIBLE_DUPLICATE_TITLE' && Array.isArray(details?.matches)) {
      this.duplicateTitles.set(details.matches as DuplicateTitleMatch[]);
    }
    if (apiError.code === 'DUPLICATE_ISBN' && Array.isArray(details?.matches)) {
      this.duplicateIsbn.set(details.matches as DuplicateIsbnMatch[]);
    }
  }

  private loadAuthors(search: string): void {
    this.catalogue.authors(search).subscribe({
      next: (result) =>
        this.authors.update((options) => [
          ...new Map([...options, ...result.data].map((item) => [item.id, item])).values(),
        ]),
      error: (err: unknown) => this.error.set(toApiError(err).message),
    });
  }

  private loadPublishers(search: string): void {
    this.catalogue.publishers(search).subscribe({
      next: (result) =>
        this.publishers.update((options) => [
          ...new Map([...options, ...result.data].map((item) => [item.id, item])).values(),
        ]),
      error: (err: unknown) => this.error.set(toApiError(err).message),
    });
  }
}

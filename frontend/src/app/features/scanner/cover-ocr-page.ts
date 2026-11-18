import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { toApiError } from '../../core/api/api';
import { AuthService } from '../../core/auth/auth.service';
import { Permissions } from '../../core/auth/auth.models';
import { PageHeader } from '../../shared/ui/page-header';
import { MetadataSuggestion, OcrLookupResponse, ScannerService } from './scanner.service';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Component({
  selector: 'app-cover-ocr-page',
  imports: [
    DecimalPipe,
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
    <app-page-header
      title="Read a book cover"
      description="Capture or upload a cover image, crop it, then review OCR text and catalogue/provider candidates."
    >
      <a mat-stroked-button routerLink="/scanner/isbn"
        ><mat-icon>barcode_reader</mat-icon> ISBN scanner</a
      >
      @if (canWrite()) {
        <a mat-stroked-button routerLink="/catalogue/books/new"
          ><mat-icon>edit</mat-icon> Enter manually</a
        >
      }
    </app-page-header>
    @if (createdEdition(); as created) {
      <section class="success" role="status">
        <mat-icon>task_alt</mat-icon>
        <div>
          <strong>{{ created.title }} saved as a title and edition.</strong
          ><span>No physical copy has been registered.</span>
        </div>
        @if (canRegisterCopy()) {
          <a
            mat-flat-button
            [routerLink]="['/catalogue/editions', created.editionId, 'copies', 'new']"
            [queryParams]="{ bookId: created.bookId, fromScan: 'cover' }"
            ><mat-icon>inventory_2</mat-icon> Register a physical copy</a
          >
        }
      </section>
    }
    @if (error()) {
      <div class="error" role="alert"><mat-icon>error</mat-icon>{{ error() }}</div>
    }
    <main class="layout">
      <section aria-labelledby="image-heading">
        <header>
          <div>
            <h2 id="image-heading">Cover image</h2>
            <p>JPEG, PNG or WebP, up to 8 MB.</p>
          </div>
          <mat-icon>photo_camera</mat-icon>
        </header>
        <div class="image-stage">
          @if (imageUrl()) {
            <img #imageView [src]="imageUrl()!" alt="Selected book cover" />
          } @else {
            <div class="empty">
              <mat-icon>image</mat-icon><span>Choose or capture a cover</span>
            </div>
          }
        </div>
        <div class="actions">
          <label class="file-button"
            ><mat-icon>photo_camera</mat-icon> Take photo<input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              (change)="selectImage($event)"
          /></label>
          <label class="file-button"
            ><mat-icon>upload_file</mat-icon> Upload<input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              (change)="selectImage($event)"
          /></label>
          @if (imageUrl()) {
            <button mat-button type="button" (click)="clearImage()">
              <mat-icon>delete</mat-icon> Remove
            </button>
          }
        </div>
        @if (croppedPreviewUrl()) {
          <div class="crop-preview">
            <span>Image sent for recognition</span
            ><img [src]="croppedPreviewUrl()!" alt="Cropped cover image sent for OCR" />
          </div>
        }
        @if (imageUrl()) {
          <div class="crop" [formGroup]="cropForm">
            <h3>Crop image</h3>
            <label
              >Left <input type="range" min="0" max="80" formControlName="left" /><output
                >{{ cropForm.controls.left.value }}%</output
              ></label
            >
            <label
              >Top <input type="range" min="0" max="80" formControlName="top" /><output
                >{{ cropForm.controls.top.value }}%</output
              ></label
            >
            <label
              >Width <input type="range" min="20" max="100" formControlName="width" /><output
                >{{ cropForm.controls.width.value }}%</output
              ></label
            >
            <label
              >Height <input type="range" min="20" max="100" formControlName="height" /><output
                >{{ cropForm.controls.height.value }}%</output
              ></label
            >
            <button mat-stroked-button type="button" (click)="resetCrop()">
              <mat-icon>crop</mat-icon> Reset crop
            </button>
          </div>
        }
        <button
          mat-flat-button
          type="button"
          (click)="runOcr()"
          [disabled]="!imageUrl() || analyzing() || !canUseScanner()"
        >
          <mat-icon>{{ analyzing() ? 'hourglass_top' : 'document_scanner' }}</mat-icon>{{
            analyzing()
              ? 'Reading cover…'
              : error()
                ? 'Retry extraction'
                : 'Extract text and search'
          }}
        </button>
        @if (!canUseScanner()) {
          <p class="hint">Scanner permission is required for OCR.</p>
        }
      </section>
      <section aria-labelledby="results-heading">
        <header>
          <div>
            <h2 id="results-heading">Review results</h2>
            <p>OCR text is a suggestion, not verified catalogue data.</p>
          </div>
          <mat-icon>manage_search</mat-icon>
        </header>
        @if (result(); as output) {
          @if (output.confidence !== null) {
            <p class="hint">OCR confidence: {{ output.confidence * 100 | number: '1.0-0' }}%</p>
          }
          @if (output.extractedText) {
            <details>
              <summary>Extracted cover text</summary>
              <pre>{{ output.extractedText }}</pre>
            </details>
          }
          @if (output.local?.books?.data?.length) {
            <h3>Matching library titles</h3>
            <p class="hint">Review existing records before creating anything.</p>
            @for (book of output.local!.books.data; track book.id) {
              <article class="result">
                <div>
                  <a [routerLink]="['/catalogue/books', book.id]"
                    ><strong>{{ book.title }}</strong></a
                  ><span>{{
                    book.authors.map((author) => author.name).join(', ') || 'No author listed'
                  }}</span>
                </div>
                @for (edition of book.editions; track edition.id) {
                  @if (canRegisterCopy()) {
                    <a
                      mat-button
                      [routerLink]="['/catalogue/editions', edition.id, 'copies', 'new']"
                      [queryParams]="{ bookId: book.id, fromScan: 'cover' }"
                      >Register copy · {{ edition.editionStatement || 'Edition' }}</a
                    >
                  }
                }
              </article>
            }
          } @else {
            <p class="hint">No local title matched the extracted text.</p>
          }
          @if (output.local?.authors?.length) {
            <h3>Matching authors</h3>
            @for (author of output.local!.authors; track author.id) {
              <p>
                <a [routerLink]="['/authors', author.id]">{{ author.name }}</a> ·
                {{ author.titles }} associated titles
              </p>
            }
          }
          @if (output.providerErrors.length) {
            <div class="warning" role="status">
              <mat-icon>cloud_off</mat-icon>External providers unavailable:
              {{ output.providerErrors.join(', ') }}
            </div>
          }
          @if (output.suggestions.length) {
            <h3>External metadata suggestions</h3>
            <p class="hint">Review a candidate before confirming any metadata.</p>
            @for (
              candidate of output.suggestions;
              track candidate.provider + candidate.externalId
            ) {
              <article class="result">
                <div>
                  <strong>{{ candidate.title }}</strong><span>{{
                    candidate.authors.join(', ') || 'Author not listed'
                  }}</span
                  ><small
                    >{{ candidate.provider === 'GOOGLE_BOOKS' ? 'Google Books' : 'Open Library' }} ·
                    {{ candidate.confidence * 100 | number: '1.0-0' }}%</small
                  >
                </div>
                @if (candidate.coverUrl) {
                  <img
                    [src]="candidate.coverUrl"
                    alt="Suggested cover"
                    referrerpolicy="no-referrer"
                  />
                }
                <button
                  mat-stroked-button
                  type="button"
                  (click)="useSuggestion(candidate)"
                  [disabled]="!canWrite()"
                >
                  <mat-icon>edit</mat-icon> Review
                </button>
              </article>
            }
          }
          <div class="correction">
            <h3>Corrected metadata</h3>
            <p class="hint">Edit extracted values, then explicitly confirm a title and edition.</p>
            <form [formGroup]="form" (ngSubmit)="confirm()" novalidate>
              <div class="fields">
                <mat-form-field class="wide"
                  ><mat-label>Title</mat-label
                  ><input matInput formControlName="title" required maxlength="300" /><mat-error
                    >Title is required.</mat-error
                  ></mat-form-field
                >
                <mat-form-field class="wide"
                  ><mat-label>Subtitle</mat-label
                  ><input matInput formControlName="subtitle" maxlength="300"
                /></mat-form-field>
                <mat-form-field class="wide"
                  ><mat-label>Author names, comma-separated</mat-label
                  ><input matInput formControlName="authors" maxlength="1000"
                /></mat-form-field>
                <mat-form-field
                  ><mat-label>Publisher</mat-label
                  ><input matInput formControlName="publisher" maxlength="200"
                /></mat-form-field>
                <mat-form-field
                  ><mat-label>ISBN (optional)</mat-label
                  ><input matInput formControlName="isbn" inputmode="numeric" maxlength="40"
                /></mat-form-field>
                <mat-form-field
                  ><mat-label>Edition</mat-label
                  ><input matInput formControlName="editionStatement" maxlength="120"
                /></mat-form-field>
                <mat-form-field
                  ><mat-label>Publication year</mat-label
                  ><input
                    matInput
                    type="number"
                    formControlName="publicationYear"
                    min="1000"
                    [max]="maxYear"
                /></mat-form-field>
                <mat-form-field
                  ><mat-label>Language</mat-label
                  ><input matInput formControlName="language" maxlength="40"
                /></mat-form-field>
                <mat-form-field
                  ><mat-label>Page count</mat-label
                  ><input matInput type="number" formControlName="pageCount" min="1"
                /></mat-form-field>
                <mat-form-field class="wide"
                  ><mat-label>Description</mat-label
                  ><textarea
                    matInput
                    rows="3"
                    formControlName="description"
                    maxlength="4000"
                  ></textarea>
                </mat-form-field>
              </div>
              @if (confirmError()) {
                <div class="error" role="alert"><mat-icon>error</mat-icon>{{ confirmError() }}</div>
              }
              <button
                mat-flat-button
                type="submit"
                [disabled]="confirming() || form.invalid || !canWrite()"
              >
                <mat-icon>{{ confirming() ? 'hourglass_top' : 'verified' }}</mat-icon>{{
                  confirming() ? 'Saving metadata…' : 'Confirm title and edition'
                }}
              </button>
              <p class="hint">
                Confirming creates title/edition only. Physical copies are registered separately.
              </p>
            </form>
          </div>
        } @else {
          <div class="empty">
            <mat-icon>text_fields</mat-icon>
            <p>Choose an image and crop it to begin.</p>
          </div>
        }
      </section>
    </main>
    <canvas #cropCanvas hidden></canvas>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .layout {
        display: grid;
        grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
        gap: 24px;
        align-items: start;
      }
      section {
        min-width: 0;
      }
      header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      header h2 {
        margin: 0 0 4px;
        font: var(--mat-sys-title-large);
      }
      header p {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
      }
      .image-stage {
        display: grid;
        place-items: center;
        min-height: 230px;
        aspect-ratio: 4/3;
        overflow: hidden;
        background: #171b1a;
        border-radius: 6px;
      }
      .image-stage img {
        width: 100%;
        max-height: 55vh;
        object-fit: contain;
      }
      .empty {
        display: grid;
        place-items: center;
        gap: 8px;
        padding: 36px 12px;
        text-align: center;
        color: var(--mat-sys-on-surface-variant);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 12px 0;
      }
      .crop-preview {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 4px 0 12px;
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
      }
      .crop-preview img {
        width: 48px;
        height: 64px;
        object-fit: cover;
        border: 1px solid var(--mat-sys-outline-variant);
      }
      .file-button {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-height: 40px;
        padding: 0 12px;
        border: 1px solid var(--mat-sys-outline);
        border-radius: 4px;
        cursor: pointer;
      }
      .file-button input {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
      }
      .file-button:focus-within {
        outline: 2px solid var(--mat-sys-primary);
        outline-offset: 2px;
      }
      .crop,
      .correction {
        border-top: 1px solid var(--mat-sys-outline-variant);
        margin: 12px 0;
        padding-top: 12px;
      }
      h3 {
        margin: 10px 0;
        font: var(--mat-sys-title-medium);
      }
      .crop label {
        display: grid;
        grid-template-columns: 58px 1fr 40px;
        align-items: center;
        gap: 8px;
        min-height: 36px;
      }
      .crop input {
        width: 100%;
        accent-color: var(--mat-sys-primary);
      }
      .crop output {
        text-align: right;
      }
      .error,
      .warning,
      .success {
        display: flex;
        align-items: center;
        gap: 9px;
        margin: 0 0 14px;
        padding: 11px 12px;
      }
      .error {
        border-left: 4px solid var(--mat-sys-error);
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .warning {
        background: color-mix(in srgb, var(--status-warning) 12%, var(--mat-sys-surface));
      }
      .success {
        border-left: 4px solid var(--app-success);
        background: color-mix(in srgb, var(--app-success) 12%, var(--mat-sys-surface));
      }
      .success div {
        display: grid;
        flex: 1 1 200px;
        gap: 3px;
      }
      .hint,
      .result span,
      .result small,
      .success span {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
      }
      details {
        margin: 12px 0;
        border-block: 1px solid var(--mat-sys-outline-variant);
        padding: 9px 0;
      }
      details summary {
        cursor: pointer;
        color: var(--mat-sys-primary);
      }
      pre {
        max-height: 180px;
        overflow: auto;
        white-space: pre-wrap;
      }
      .result {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
        padding: 12px 0;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }
      .result div {
        display: grid;
        gap: 4px;
      }
      .result img {
        width: 48px;
        height: 68px;
        object-fit: cover;
      }
      .fields {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 2px 12px;
      }
      .fields mat-form-field {
        width: 100%;
      }
      .fields .wide {
        grid-column: 1/-1;
      }
      @media (max-width: 780px) {
        .layout {
          grid-template-columns: 1fr;
          gap: 22px;
        }
      }
      @media (max-width: 520px) {
        .fields {
          grid-template-columns: 1fr;
        }
        .fields .wide {
          grid-column: auto;
        }
        .image-stage img {
          max-height: 45vh;
        }
      }
    `,
  ],
})
export class CoverOcrPage {
  private readonly fb = inject(FormBuilder);
  private readonly scanner = inject(ScannerService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private selectedFile: File | null = null;
  private imageObjectUrl: string | null = null;
  private croppedObjectUrl: string | null = null;
  private readonly image = viewChild<ElementRef<HTMLImageElement>>('imageView');
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('cropCanvas');
  protected readonly maxYear = new Date().getFullYear() + 1;
  protected readonly imageUrl = signal<string | null>(null);
  protected readonly croppedPreviewUrl = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmError = signal<string | null>(null);
  protected readonly analyzing = signal(false);
  protected readonly confirming = signal(false);
  protected readonly result = signal<OcrLookupResponse | null>(null);
  protected readonly createdEdition = signal<{
    bookId: string;
    editionId: string;
    title: string;
  } | null>(null);
  protected readonly canWrite = computed(() => {
    this.auth.user();
    return this.auth.hasPermission(Permissions.CATALOGUE_WRITE);
  });
  protected readonly canRegisterCopy = computed(() => {
    this.auth.user();
    return this.auth.hasPermission(Permissions.COPIES_WRITE);
  });
  protected readonly canUseScanner = computed(() => {
    this.auth.user();
    return this.auth.hasPermission(Permissions.SCANNER_USE);
  });
  protected readonly cropForm = this.fb.nonNullable.group({
    left: [0],
    top: [0],
    width: [100],
    height: [100],
  });
  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(300)]],
    subtitle: ['', Validators.maxLength(300)],
    editionStatement: ['', Validators.maxLength(120)],
    authors: ['', Validators.maxLength(1000)],
    isbn: ['', Validators.maxLength(40)],
    publisher: ['', Validators.maxLength(200)],
    publicationYear: this.fb.control<number | null>(null, [
      Validators.min(1000),
      Validators.max(this.maxYear),
    ]),
    description: ['', Validators.maxLength(4000)],
    language: ['', Validators.maxLength(40)],
    pageCount: this.fb.control<number | null>(null, Validators.min(1)),
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.revokeImages());
  }

  protected selectImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      this.error.set('Choose a JPEG, PNG or WebP image.');
      input.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.error.set('Cover image must be no larger than 8 MB.');
      input.value = '';
      return;
    }
    this.revokeImages();
    this.selectedFile = file;
    this.imageObjectUrl = URL.createObjectURL(file);
    this.imageUrl.set(this.imageObjectUrl);
    this.result.set(null);
    this.createdEdition.set(null);
    this.error.set(null);
    this.resetCrop();
    input.value = '';
    this.croppedPreviewUrl.set(null);
  }

  protected resetCrop(): void {
    this.cropForm.setValue({ left: 0, top: 0, width: 100, height: 100 });
    this.croppedPreviewUrl.set(null);
  }
  protected clearImage(): void {
    this.revokeImages();
    this.selectedFile = null;
    this.imageUrl.set(null);
    this.croppedPreviewUrl.set(null);
    this.result.set(null);
    this.error.set(null);
    this.createdEdition.set(null);
  }

  protected async runOcr(): Promise<void> {
    if (!this.selectedFile || this.analyzing()) return;
    this.error.set(null);
    this.confirmError.set(null);
    this.createdEdition.set(null);
    this.analyzing.set(true);
    try {
      const file = await this.makeCropFile();
      if (this.croppedObjectUrl) URL.revokeObjectURL(this.croppedObjectUrl);
      this.croppedObjectUrl = URL.createObjectURL(file);
      this.croppedPreviewUrl.set(this.croppedObjectUrl);
      this.scanner
        .lookupCover(file)
        .pipe(finalize(() => this.analyzing.set(false)))
        .subscribe({
          next: (result) => {
            this.result.set(result);
            this.form.patchValue({
              title: result.fields.title ?? '',
              authors: result.fields.authors.join(', '),
              publisher: result.fields.publisher ?? '',
              isbn: this.findIsbn(result.extractedText),
            });
          },
          error: (error: unknown) => this.error.set(toApiError(error).message),
        });
    } catch (error: unknown) {
      this.analyzing.set(false);
      this.error.set(
        error instanceof Error ? error.message : 'Could not crop the image. Try again.',
      );
    }
  }

  protected useSuggestion(suggestion: MetadataSuggestion): void {
    this.form.patchValue({
      title: suggestion.title,
      subtitle: suggestion.subtitle ?? '',
      authors: suggestion.authors.join(', '),
      isbn: suggestion.isbn13 ?? suggestion.isbn10 ?? this.form.controls.isbn.value,
      publisher: suggestion.publisher ?? '',
      publicationYear: suggestion.publicationYear,
      description: suggestion.description ?? '',
      language: suggestion.language ?? '',
      pageCount: suggestion.pageCount,
    });
  }

  protected confirm(): void {
    if (this.form.invalid || this.confirming()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.confirming.set(true);
    this.confirmError.set(null);
    this.scanner
      .confirmOcrMetadata({
        title: value.title.trim(),
        subtitle: value.subtitle.trim() || null,
        editionStatement: value.editionStatement.trim() || null,
        isbn: value.isbn.trim() || null,
        authors: value.authors
          .split(',')
          .map((author) => author.trim())
          .filter(Boolean),
        publisher: value.publisher.trim() || null,
        publicationYear: value.publicationYear,
        description: value.description.trim() || null,
        language: value.language.trim() || null,
        pageCount: value.pageCount,
        provider: this.result()?.provider ?? 'OCR',
        confidence: this.result()?.confidence ?? null,
      })
      .pipe(finalize(() => this.confirming.set(false)))
      .subscribe({
        next: (created) => this.createdEdition.set(created),
        error: (error: unknown) => this.confirmError.set(toApiError(error).message),
      });
  }

  private async makeCropFile(): Promise<File> {
    const image = this.image()?.nativeElement;
    const canvas = this.canvas()?.nativeElement;
    if (!image?.complete || !image.naturalWidth || !canvas)
      throw new Error('Image preview is not ready yet.');
    const { left, top, width, height } = this.cropForm.getRawValue();
    const sx = Math.round((image.naturalWidth * left) / 100);
    const sy = Math.round((image.naturalHeight * top) / 100);
    const sw = Math.max(
      1,
      Math.min(image.naturalWidth - sx, Math.round((image.naturalWidth * width) / 100)),
    );
    const sh = Math.max(
      1,
      Math.min(image.naturalHeight - sy, Math.round((image.naturalHeight * height) / 100)),
    );
    canvas.width = sw;
    canvas.height = sh;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image crop is unavailable in this browser.');
    context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('Could not crop this image.'))),
        this.selectedFile?.type ?? 'image/jpeg',
        0.92,
      ),
    );
    return new File([blob], 'cover-crop', { type: blob.type || 'image/jpeg' });
  }

  private findIsbn(text: string): string {
    return (
      text
        .match(/(?:ISBN(?:-1[03])?:?\s*)?((?:97[89][\d\s-]{10,18})|(?:\d[\d\s-]{8,16}[\dX]))/i)?.[1]
        ?.trim() ?? ''
    );
  }
  private revokeImages(): void {
    if (this.imageObjectUrl) URL.revokeObjectURL(this.imageObjectUrl);
    if (this.croppedObjectUrl) URL.revokeObjectURL(this.croppedObjectUrl);
    this.imageObjectUrl = null;
    this.croppedObjectUrl = null;
  }
}

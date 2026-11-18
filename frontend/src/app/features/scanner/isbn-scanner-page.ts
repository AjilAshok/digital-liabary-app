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
import { BrowserCodeReader, BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';
import { finalize } from 'rxjs';
import { toApiError } from '../../core/api/api';
import { Permissions } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { PageHeader } from '../../shared/ui/page-header';
import {
  ConfirmMetadataInput,
  IsbnLookupResponse,
  MetadataSuggestion,
  ScannerService,
} from './scanner.service';

function cleanIsbn(value: string): string {
  return value
    .trim()
    .replace(/^isbn(?:-1[03])?:?\s*/i, '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
}

export function isValidIsbn(value: string): boolean {
  const isbn = cleanIsbn(value);
  if (/^\d{9}[\dX]$/.test(isbn)) {
    return (
      [...isbn].reduce(
        (sum, char, index) => sum + (char === 'X' ? 10 : Number(char)) * (10 - index),
        0,
      ) %
        11 ===
      0
    );
  }
  if (/^97[89]\d{10}$/.test(isbn)) {
    const sum = [...isbn.slice(0, 12)].reduce(
      (total, char, index) => total + Number(char) * (index % 2 ? 3 : 1),
      0,
    );
    return String((10 - (sum % 10)) % 10) === isbn[12];
  }
  return false;
}

@Component({
  selector: 'app-isbn-scanner-page',
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
      title="Scan ISBN"
      description="Scan an edition barcode or enter an ISBN manually. A lookup never registers a physical copy."
    >
      <a mat-stroked-button routerLink="/catalogue/books"
        ><mat-icon>arrow_back</mat-icon> Catalogue</a
      >
      <a mat-stroked-button routerLink="/scanner/cover"
        ><mat-icon>image_search</mat-icon> Read a cover</a
      >
    </app-page-header>

    @if (createdEdition(); as created) {
      <section class="created-edition" role="status">
        <mat-icon>task_alt</mat-icon>
        <div>
          <strong>{{ created.title }} saved as a title and edition.</strong>
          <span>No physical copy has been registered.</span>
        </div>
        @if (canRegisterCopy()) {
          <a
            mat-flat-button
            [routerLink]="['/catalogue/editions', created.editionId, 'copies', 'new']"
            [queryParams]="{ bookId: created.bookId, fromScan: 'isbn' }"
            ><mat-icon>inventory_2</mat-icon> Register a physical copy</a
          >
        } @else {
          <span class="permission-note"
            >A librarian with copy-registration access can register stock.</span
          >
        }
      </section>
    }

    <main class="scanner-layout">
      <section class="scanner-panel" aria-labelledby="camera-heading">
        <div class="panel-heading">
          <div>
            <h2 id="camera-heading">Camera scanner</h2>
            <p>Use a steady, well-lit view of the barcode.</p>
          </div>
          <mat-icon aria-hidden="true">document_scanner</mat-icon>
        </div>
        <div class="camera-frame" [class.camera-frame--active]="cameraActive()">
          <video
            #preview
            autoplay
            muted
            playsinline
            aria-label="Live barcode camera preview"
          ></video>
          @if (!cameraActive()) {
            <div class="camera-placeholder">
              <mat-icon>photo_camera</mat-icon><span>Camera preview</span>
            </div>
          }
          @if (cameraActive()) {
            <div class="scan-target" aria-hidden="true"><span></span></div>
          }
        </div>
        @if (cameraError()) {
          <div class="scanner-alert" role="alert">
            <mat-icon>warning</mat-icon><span>{{ cameraError() }}</span>
          </div>
        }
        @if (!secureContext) {
          <div class="scanner-alert" role="status">
            <mat-icon>https</mat-icon
            ><span>Camera scanning requires HTTPS on deployed sites. Localhost is supported.</span>
          </div>
        }
        <p class="lighting-tip">
          <mat-icon>wb_sunny</mat-icon> If the barcode is not detected, add light, reduce glare, and
          hold the phone steady. You can always type the ISBN below.
        </p>
        <div class="camera-actions">
          @if (!cameraActive()) {
            <button
              mat-flat-button
              type="button"
              (click)="startCamera()"
              [disabled]="cameraStarting()"
            >
              <mat-icon>{{ cameraStarting() ? 'hourglass_top' : 'videocam' }}</mat-icon>{{
                cameraStarting() ? 'Starting…' : 'Start camera'
              }}
            </button>
          } @else {
            <button mat-stroked-button type="button" (click)="stopCamera()">
              <mat-icon>videocam_off</mat-icon> Stop camera</button
            ><button
              mat-stroked-button
              type="button"
              (click)="switchCamera()"
              [disabled]="cameraDevices().length < 2"
            >
              <mat-icon>cameraswitch</mat-icon> Switch camera
            </button>
          }
        </div>
        @if (cameraActive() && scanPaused()) {
          <button
            mat-stroked-button
            type="button"
            (click)="scanNext()"
            [disabled]="lookingUp() || confirming() || !!editingSuggestion()"
          >
            <mat-icon>document_scanner</mat-icon> Scan another barcode
          </button>
        }
      </section>

      <section class="manual-panel" aria-labelledby="manual-heading">
        <div class="panel-heading">
          <div>
            <h2 id="manual-heading">Manual ISBN entry</h2>
            <p>Accepts ISBN-10 or ISBN-13 with optional spaces or hyphens.</p>
          </div>
          <mat-icon aria-hidden="true">keyboard</mat-icon>
        </div>
        <form class="isbn-form" [formGroup]="isbnForm" (ngSubmit)="lookupManual()" novalidate>
          <mat-form-field
            ><mat-label>ISBN</mat-label
            ><input
              matInput
              formControlName="isbn"
              inputmode="numeric"
              autocomplete="off"
              placeholder="9780306406157"
              (input)="clearState()"
            /><mat-error>Enter a valid ISBN-10 or ISBN-13.</mat-error></mat-form-field
          >
          <button mat-flat-button type="submit" [disabled]="lookingUp()">
            <mat-icon>{{ lookingUp() ? 'hourglass_top' : 'search' }}</mat-icon>{{
              lookingUp() ? 'Looking up…' : 'Look up ISBN'
            }}
          </button>
        </form>
        @if (lookupError()) {
          <div class="scanner-alert" role="alert">
            <mat-icon>error</mat-icon><span>{{ lookupError() }}</span>
          </div>
        }
        @if (response(); as result) {
          @if (!result.valid) {
            <div class="scanner-alert" role="alert">
              <mat-icon>barcode_reader</mat-icon
              ><span>Invalid ISBN. Check the barcode or enter the ISBN manually.</span>
            </div>
          } @else {
            <div class="lookup-summary" role="status">
              <span>Validated ISBN-13</span><strong>{{ result.isbn13 }}</strong>
            </div>
            @if (result.localMatches.length) {
              <div class="match-section">
                <h3>Already in this library</h3>
                <p>
                  Choose the matching edition to register another physical copy. No copy has been
                  created.
                </p>
                @for (match of result.localMatches; track match.editionId) {
                  <article class="local-match">
                    <div>
                      <a class="match-title" [routerLink]="['/catalogue/books', match.bookId]">{{
                        match.title
                      }}</a><span
                        >{{ match.editionStatement || 'Edition' }} ·
                        {{ match.publisher || 'Publisher not recorded' }}</span
                      ><span>{{
                        match.authors.map((author) => author.name).join(', ') || 'No author listed'
                      }}</span
                      ><strong
                        >{{ match.copies }} holdings · {{ match.available }} available</strong
                      >
                    </div>
                    @if (canRegisterCopy()) {
                      <a
                        mat-flat-button
                        [routerLink]="['/catalogue/editions', match.editionId, 'copies', 'new']"
                        [queryParams]="{ bookId: match.bookId, fromScan: 'isbn' }"
                        ><mat-icon>add</mat-icon> Add another copy</a
                      >
                    } @else {
                      <span class="permission-note">Ask a librarian to register another copy.</span>
                    }
                  </article>
                }
              </div>
            } @else {
              <div class="match-section">
                <h3>External metadata suggestions</h3>
                @if (result.providerErrors.length && result.suggestions.length) {
                  <div class="scanner-alert" role="status">
                    <mat-icon>cloud_off</mat-icon>
                    <span
                      >Some providers were unavailable:
                      {{ result.providerErrors.join(', ') }}.</span
                    >
                  </div>
                }
                @if (result.suggestions.length) {
                  <p>
                    These are suggestions only. Review and correct metadata before saving the title.
                    No physical copy will be created.
                  </p>
                  @for (item of result.suggestions; track item.provider + item.externalId) {
                    <article class="metadata-card">
                      <div class="metadata-card__top">
                        <div>
                          <strong>{{ item.title }}</strong><span
                            >{{
                              item.provider === 'GOOGLE_BOOKS' ? 'Google Books' : 'Open Library'
                            }}
                            · {{ item.confidence * 100 | number: '1.0-0' }}% ISBN match</span
                          >
                        </div>
                        @if (item.coverUrl) {
                          <img
                            [src]="item.coverUrl"
                            alt="Suggested cover"
                            referrerpolicy="no-referrer"
                          />
                        }
                      </div>
                      <p>
                        {{ item.authors.join(', ') || 'No author listed' }}
                        @if (item.publisher) {
                          · {{ item.publisher }}
                        }
                        @if (item.publicationYear) {
                          · {{ item.publicationYear }}
                        }
                      </p>
                      <button mat-stroked-button type="button" (click)="editSuggestion(item)">
                        <mat-icon>edit</mat-icon> Review and correct
                      </button>
                    </article>
                  }
                } @else if (result.providerErrors.length) {
                  <div class="scanner-alert" role="alert">
                    <mat-icon>cloud_off</mat-icon
                    ><span
                      >Could not reach {{ result.providerErrors.join(' and ') }}. Check your
                      connection or enter the book details manually.</span
                    >
                  </div>
                  @if (canConfirmMetadata()) {
                    <a
                      mat-stroked-button
                      routerLink="/catalogue/books/new"
                      [queryParams]="{ isbn: result.isbn13 }"
                      >Enter book manually</a
                    >
                  } @else {
                    <p class="permission-note">
                      A librarian with catalogue write access can enter the metadata.
                    </p>
                  }
                } @else {
                  <p>
                    No external matches found. Enter the book details manually if you can verify the
                    edition.
                  </p>
                  @if (canConfirmMetadata()) {
                    <a
                      mat-stroked-button
                      routerLink="/catalogue/books/new"
                      [queryParams]="{ isbn: result.isbn13 }"
                      >Enter book manually</a
                    >
                  } @else {
                    <p class="permission-note">
                      A librarian with catalogue write access can enter the metadata.
                    </p>
                  }
                }
              </div>
            }
          }
        }
      </section>
    </main>

    @if (editingSuggestion(); as suggestion) {
      <div class="dialog-backdrop" role="presentation">
        <section
          class="metadata-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="metadata-heading"
        >
          <div class="panel-heading">
            <div>
              <h2 id="metadata-heading">Review book metadata</h2>
              <p>Correct provider suggestions before adding this title and edition.</p>
            </div>
            <button
              mat-icon-button
              type="button"
              aria-label="Close metadata review"
              (click)="editingSuggestion.set(null)"
            >
              <mat-icon>close</mat-icon>
            </button>
          </div>
          @if (confirmError()) {
            <div class="scanner-alert" role="alert">
              <mat-icon>error</mat-icon><span>{{ confirmError() }}</span>
            </div>
          }
          <form [formGroup]="metadataForm" (ngSubmit)="confirmMetadata(suggestion)" novalidate>
            <div class="metadata-grid">
              <mat-form-field class="wide"
                ><mat-label>Title</mat-label
                ><input matInput formControlName="title" required maxlength="300"
              /></mat-form-field>
              <mat-form-field class="wide"
                ><mat-label>Subtitle</mat-label
                ><input matInput formControlName="subtitle" maxlength="300"
              /></mat-form-field>
              <mat-form-field class="wide"
                ><mat-label>Authors, separated by commas</mat-label
                ><input matInput formControlName="authors" maxlength="1000"
              /></mat-form-field>
              <mat-form-field
                ><mat-label>ISBN</mat-label
                ><input matInput formControlName="isbn" required inputmode="numeric"
              /></mat-form-field>
              <mat-form-field
                ><mat-label>Edition</mat-label
                ><input matInput formControlName="editionStatement" maxlength="120"
              /></mat-form-field>
              <mat-form-field
                ><mat-label>Publisher</mat-label
                ><input matInput formControlName="publisher" maxlength="200"
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
            <div class="dialog-actions">
              @if (canConfirmMetadata()) {
                <button
                  mat-flat-button
                  type="submit"
                  [disabled]="confirming() || metadataForm.invalid"
                >
                  <mat-icon>{{ confirming() ? 'hourglass_top' : 'verified' }}</mat-icon>{{
                    confirming() ? 'Saving metadata…' : 'Confirm metadata'
                  }}
                </button>
              } @else {
                <span>A librarian with catalogue write access must confirm this metadata.</span>
              }
              <span>Title/edition only. Register physical copies separately.</span>
            </div>
          </form>
        </section>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .scanner-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
        gap: 24px;
        align-items: start;
      }
      .created-edition {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 20px;
        padding: 14px;
        border-left: 4px solid var(--app-success);
        background: color-mix(in srgb, var(--app-success) 12%, var(--mat-sys-surface));
      }
      .created-edition > div {
        display: grid;
        flex: 1 1 220px;
        gap: 3px;
      }
      .created-edition span {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
      }
      .scanner-panel,
      .manual-panel {
        min-width: 0;
      }
      .panel-heading {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 14px;
      }
      .panel-heading h2 {
        margin: 0 0 4px;
        font: var(--mat-sys-title-large);
      }
      .panel-heading p {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
      }
      .panel-heading > mat-icon {
        color: var(--mat-sys-primary);
      }
      .camera-frame {
        position: relative;
        overflow: hidden;
        min-height: 240px;
        aspect-ratio: 4 / 3;
        background: #101413;
        border-radius: 6px;
      }
      .camera-frame video {
        display: block;
        width: 100%;
        height: 100%;
        min-height: 240px;
        object-fit: cover;
      }
      .camera-placeholder {
        position: absolute;
        inset: 0;
        display: grid;
        place-content: center;
        justify-items: center;
        gap: 8px;
        color: #e8eee8;
      }
      .camera-placeholder mat-icon {
        width: 48px;
        height: 48px;
        font-size: 48px;
        opacity: 0.8;
      }
      .scan-target {
        position: absolute;
        left: 10%;
        right: 10%;
        top: 37%;
        height: 26%;
        border: 2px solid #d5f17d;
        box-shadow: 0 0 0 999px #0005;
        border-radius: 8px;
        pointer-events: none;
      }
      .lighting-tip {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin: 12px 0;
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
      }
      .lighting-tip mat-icon {
        flex: 0 0 auto;
        color: var(--status-warning);
      }
      .camera-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .isbn-form {
        display: flex;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 10px;
      }
      .isbn-form mat-form-field {
        flex: 1 1 210px;
      }
      .isbn-form button {
        margin-top: 2px;
      }
      .scanner-alert {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        margin: 12px 0;
        padding: 11px 12px;
        border-left: 4px solid var(--status-warning);
        background: color-mix(in srgb, var(--status-warning) 12%, var(--mat-sys-surface));
      }
      .scanner-alert mat-icon {
        flex: 0 0 auto;
      }
      .lookup-summary {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 0;
        border-block: 1px solid var(--mat-sys-outline-variant);
      }
      .lookup-summary span {
        color: var(--mat-sys-on-surface-variant);
      }
      .match-section {
        margin-top: 18px;
      }
      .match-section h3 {
        margin: 0 0 5px;
        font: var(--mat-sys-title-medium);
      }
      .match-section > p {
        margin: 0 0 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .local-match {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        padding: 13px 0;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }
      .local-match > div {
        display: grid;
        gap: 4px;
      }
      .local-match span,
      .local-match strong {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
      }
      .match-title {
        color: var(--mat-sys-primary);
        font-weight: 650;
      }
      .permission-note {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
      }
      .metadata-card {
        padding: 14px 0;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }
      .metadata-card__top {
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }
      .metadata-card__top div {
        display: grid;
        gap: 4px;
      }
      .metadata-card__top span,
      .metadata-card p {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
      }
      .metadata-card p {
        margin: 6px 0 10px;
      }
      .metadata-card img {
        width: 48px;
        height: 68px;
        object-fit: cover;
      }
      .dialog-backdrop {
        position: fixed;
        inset: 0;
        z-index: 20;
        display: grid;
        place-items: center;
        overflow-y: auto;
        padding: 18px;
        background: #0008;
      }
      .metadata-dialog {
        width: min(760px, 100%);
        max-height: min(90vh, 900px);
        overflow-y: auto;
        padding: 22px;
        background: var(--mat-sys-surface);
        color: var(--mat-sys-on-surface);
        border-radius: 6px;
        box-shadow: var(--mat-sys-level3);
      }
      .metadata-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 2px 12px;
      }
      .metadata-grid mat-form-field {
        width: 100%;
      }
      .metadata-grid .wide {
        grid-column: 1 / -1;
      }
      .dialog-actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        padding-top: 8px;
      }
      .dialog-actions span {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
      }
      @media (max-width: 760px) {
        .scanner-layout {
          grid-template-columns: 1fr;
          gap: 28px;
        }
        .scanner-panel {
          order: 0;
        }
        .manual-panel {
          order: 1;
        }
        .camera-frame {
          min-height: 210px;
        }
      }
      @media (max-width: 520px) {
        .metadata-grid {
          grid-template-columns: 1fr;
        }
        .metadata-grid .wide {
          grid-column: auto;
        }
        .metadata-dialog {
          padding: 16px;
        }
        .isbn-form {
          display: grid;
          grid-template-columns: 1fr;
        }
        .isbn-form button {
          justify-self: start;
          margin-top: -12px;
        }
      }
    `,
  ],
})
export class IsbnScannerPage {
  private readonly fb = inject(FormBuilder);
  private readonly scanner = inject(ScannerService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reader = new BrowserMultiFormatReader(undefined, {
    delayBetweenScanAttempts: 180,
  });
  private controls: { stop: () => void } | null = null;
  private cameraIndex = -1;
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('preview');

  protected readonly secureContext = typeof window !== 'undefined' && window.isSecureContext;
  protected readonly maxYear = new Date().getFullYear() + 1;
  protected readonly isbnForm = this.fb.nonNullable.group({ isbn: ['', Validators.required] });
  protected readonly metadataForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(300)]],
    subtitle: ['', Validators.maxLength(300)],
    editionStatement: ['', Validators.maxLength(120)],
    authors: ['', Validators.maxLength(1000)],
    isbn: ['', Validators.required],
    publisher: ['', Validators.maxLength(200)],
    publicationYear: this.fb.control<number | null>(null, [
      Validators.min(1000),
      Validators.max(this.maxYear),
    ]),
    description: ['', Validators.maxLength(4000)],
    language: ['', Validators.maxLength(40)],
    pageCount: this.fb.control<number | null>(null, Validators.min(1)),
  });
  protected readonly cameraDevices = signal<MediaDeviceInfo[]>([]);
  protected readonly cameraActive = signal(false);
  protected readonly cameraStarting = signal(false);
  protected readonly scanPaused = signal(false);
  protected readonly cameraError = signal<string | null>(null);
  protected readonly lookupError = signal<string | null>(null);
  protected readonly confirmError = signal<string | null>(null);
  protected readonly lookingUp = signal(false);
  protected readonly confirming = signal(false);
  protected readonly response = signal<IsbnLookupResponse | null>(null);
  protected readonly editingSuggestion = signal<MetadataSuggestion | null>(null);
  protected readonly createdEdition = signal<{
    bookId: string;
    editionId: string;
    title: string;
  } | null>(null);
  protected readonly canRegisterCopy = computed(() => {
    this.auth.user();
    return this.auth.hasPermission(Permissions.COPIES_WRITE);
  });
  protected readonly canConfirmMetadata = computed(() => {
    this.auth.user();
    return this.auth.hasPermission(Permissions.CATALOGUE_WRITE);
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.stopCamera());
  }

  protected async startCamera(): Promise<void> {
    this.cameraError.set(null);
    if (!this.secureContext) {
      this.cameraError.set(
        'Camera access requires HTTPS. Use manual ISBN entry in this browser context.',
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.cameraError.set('This browser does not support camera access. Enter the ISBN manually.');
      return;
    }
    const video = this.video()?.nativeElement;
    if (!video) {
      this.cameraError.set('Camera preview is unavailable. Use manual ISBN entry.');
      return;
    }
    this.cameraStarting.set(true);
    try {
      const devices = await BrowserCodeReader.listVideoInputDevices();
      this.cameraDevices.set(devices);
      let deviceId: string | undefined;
      if (devices.length) {
        const rearIndex = devices.findIndex((device) =>
          /back|rear|environment/i.test(device.label),
        );
        this.cameraIndex = rearIndex >= 0 ? rearIndex : Math.max(0, devices.length - 1);
        deviceId = devices[this.cameraIndex]?.deviceId;
      }
      this.controls = await this.reader.decodeFromVideoDevice(deviceId, video, (result, error) => {
        if (result && !this.scanPaused()) {
          const raw = result.getText();
          if (!isValidIsbn(raw)) return;
          this.scanPaused.set(true);
          this.isbnForm.controls.isbn.setValue(raw);
          this.lookup(raw);
          return;
        }
        if (error && !(error instanceof NotFoundException)) {
          // Decode misses are expected between frames; camera failures are reported by setup.
        }
      });
      this.cameraActive.set(true);
    } catch (error: unknown) {
      const name = error instanceof DOMException ? error.name : '';
      this.cameraError.set(
        name === 'NotAllowedError' || name === 'PermissionDeniedError'
          ? 'Camera permission was denied. Allow camera access in browser settings or enter the ISBN manually.'
          : name === 'NotFoundError' || name === 'DevicesNotFoundError'
            ? 'No camera was found. Enter the ISBN manually.'
            : name === 'NotReadableError'
              ? 'The camera is busy in another app. Close it and retry, or enter the ISBN manually.'
              : 'Unable to start the camera. Check browser permission and camera availability, or enter the ISBN manually.',
      );
    } finally {
      this.cameraStarting.set(false);
    }
  }

  protected stopCamera(): void {
    this.controls?.stop();
    this.controls = null;
    this.cameraActive.set(false);
    this.scanPaused.set(false);
    const video = this.video()?.nativeElement;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }

  protected async switchCamera(): Promise<void> {
    const devices = this.cameraDevices();
    if (devices.length < 2) return;
    this.cameraIndex = (this.cameraIndex + 1) % devices.length;
    const deviceId = devices[this.cameraIndex]?.deviceId;
    this.stopCamera();
    this.cameraStarting.set(true);
    try {
      const video = this.video()?.nativeElement;
      if (!video) return;
      this.controls = await this.reader.decodeFromVideoDevice(deviceId, video, (result) => {
        if (result && !this.scanPaused()) {
          const raw = result.getText();
          if (!isValidIsbn(raw)) return;
          this.scanPaused.set(true);
          this.isbnForm.controls.isbn.setValue(raw);
          this.lookup(raw);
        }
      });
      this.cameraActive.set(true);
      this.cameraError.set(null);
    } catch {
      this.cameraError.set('Could not switch camera. Check permission and try again.');
    } finally {
      this.cameraStarting.set(false);
    }
  }

  protected clearState(): void {
    this.response.set(null);
    this.lookupError.set(null);
    this.createdEdition.set(null);
  }

  protected scanNext(): void {
    this.isbnForm.reset({ isbn: '' });
    this.clearState();
    this.editingSuggestion.set(null);
    this.confirmError.set(null);
    this.scanPaused.set(false);
  }

  protected lookupManual(): void {
    const isbn = this.isbnForm.getRawValue().isbn.trim();
    if (this.cameraActive()) this.scanPaused.set(true);
    this.lookup(isbn);
  }

  protected lookup(raw: string): void {
    if (!isValidIsbn(raw)) {
      this.lookupError.set(
        'Invalid ISBN-10 or ISBN-13 check digit. Try scanning again or correct the number.',
      );
      this.response.set({
        valid: false,
        isbn13: null,
        localMatches: [],
        suggestions: [],
        providerErrors: [],
      });
      return;
    }
    this.lookingUp.set(true);
    this.lookupError.set(null);
    this.response.set(null);
    this.createdEdition.set(null);
    this.scanner
      .lookupIsbn(raw)
      .pipe(finalize(() => this.lookingUp.set(false)))
      .subscribe({
        next: (result) => this.response.set(result),
        error: (error: unknown) => this.lookupError.set(toApiError(error).message),
      });
  }

  protected editSuggestion(suggestion: MetadataSuggestion): void {
    this.confirmError.set(null);
    this.metadataForm.reset({
      title: suggestion.title,
      subtitle: suggestion.subtitle ?? '',
      editionStatement: '',
      authors: suggestion.authors.join(', '),
      isbn: suggestion.isbn13 ?? this.response()?.isbn13 ?? '',
      publisher: suggestion.publisher ?? '',
      publicationYear: suggestion.publicationYear,
      description: suggestion.description ?? '',
      language: suggestion.language ?? '',
      pageCount: suggestion.pageCount,
    });
    this.editingSuggestion.set(suggestion);
  }

  protected confirmMetadata(suggestion: MetadataSuggestion): void {
    if (this.metadataForm.invalid || this.confirming()) {
      this.metadataForm.markAllAsTouched();
      return;
    }
    const values = this.metadataForm.getRawValue();
    const payload: ConfirmMetadataInput = {
      provider: suggestion.provider,
      externalId: suggestion.externalId,
      isbn: values.isbn,
      title: values.title,
      subtitle: values.subtitle.trim() || null,
      editionStatement: values.editionStatement.trim() || null,
      authors: values.authors
        .split(',')
        .map((author) => author.trim())
        .filter(Boolean),
      publisher: values.publisher.trim() || null,
      publicationYear: values.publicationYear,
      description: values.description.trim() || null,
      language: values.language.trim() || null,
      pageCount: values.pageCount,
      confidence: suggestion.confidence,
    };
    this.confirming.set(true);
    this.confirmError.set(null);
    this.scanner
      .confirmMetadata(payload)
      .pipe(finalize(() => this.confirming.set(false)))
      .subscribe({
        next: (created) => {
          this.createdEdition.set(created);
          this.editingSuggestion.set(null);
        },
        error: (error: unknown) => {
          const apiError = toApiError(error);
          const matches = (
            apiError.details as
              { matches?: { title: string; bookId?: string; editionId?: string }[] } | undefined
          )?.matches;
          this.confirmError.set(
            matches?.length
              ? `${apiError.message} Existing match: ${matches.map((match) => match.title).join(', ')}.`
              : apiError.fieldErrors.length
                ? `${apiError.message}: ${apiError.fieldErrors.map((issue) => issue.message).join('; ')}`
                : apiError.message,
          );
        },
      });
  }
}

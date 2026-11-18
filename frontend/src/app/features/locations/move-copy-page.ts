import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toApiError } from '../../core/api/api';
import { PageHeader } from '../../shared/ui/page-header';
import { CopyMatch, LocationsService } from './locations.service';

@Component({
  selector: 'app-move-copy-page',
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
    <app-page-header
      title="Move a physical copy"
      description="Move one accessioned copy to a new shelf. The movement is added to its history."
    >
      <a mat-stroked-button routerLink="/locations"><mat-icon>arrow_back</mat-icon> Locations</a>
    </app-page-header>

    @if (error()) {
      <div class="move-error" role="alert">
        <mat-icon>error</mat-icon><span>{{ error() }}</span>
      </div>
    }
    @if (success()) {
      <p class="move-success" role="status">
        <mat-icon>check_circle</mat-icon>Copy {{ success()!.accessionNumber }} moved successfully.
      </p>
    }

    <section class="move-search" aria-labelledby="find-copy-heading">
      <h2 id="find-copy-heading">Find copy</h2>
      <form class="search-form" [formGroup]="searchForm" (ngSubmit)="searchCopies()" novalidate>
        <mat-form-field
          ><mat-label>Accession number</mat-label
          ><input matInput formControlName="search" required autocomplete="off" /><mat-error
            >Enter an accession number.</mat-error
          ></mat-form-field
        >
        <button mat-flat-button type="submit" [disabled]="searching()">
          <mat-icon>{{ searching() ? 'hourglass_top' : 'search' }}</mat-icon>{{
            searching() ? 'Searching…' : 'Find copy'
          }}
        </button>
      </form>
      @if (searchError()) {
        <p class="inline-error" role="alert">{{ searchError() }}</p>
      }
      @if (matches().length) {
        <div class="match-list" aria-label="Matching copies">
          @for (copy of matches(); track copy.id) {
            <button
              type="button"
              class="copy-match"
              [class.copy-match--selected]="selected()?.id === copy.id"
              (click)="selectCopy(copy)"
            >
              <span
                ><strong>{{ copy.accessionNumber }}</strong
                ><small
                  >{{ copy.book.title }} · {{ copy.edition.editionStatement || 'Edition' }}</small
                ></span
              >
              <span>{{ copy.shelf?.path || 'Unshelved' }}</span><mat-icon aria-hidden="true">{{
                selected()?.id === copy.id ? 'check_circle' : 'chevron_right'
              }}</mat-icon>
            </button>
          }
        </div>
      }
    </section>

    @if (selected(); as copy) {
      @if (copy.status === 'ISSUED' || copy.status === 'RESERVED') {
        <div class="blocked-message" role="alert">
          <mat-icon>block</mat-icon
          ><span
            >This copy is {{ copy.status.toLowerCase() }} and cannot be moved until its circulation
            status changes.</span
          >
        </div>
      } @else {
        <form class="move-form" [formGroup]="moveForm" (ngSubmit)="move()" novalidate>
          <h2>Move {{ copy.accessionNumber }}</h2>
          <p class="current-location">
            <span>Current shelf</span><strong>{{ copy.shelf?.path || 'Unshelved' }}</strong>
          </p>
          <mat-form-field class="target-shelf"
            ><mat-label>Destination shelf</mat-label
            ><mat-select formControlName="shelfId"
              ><mat-option [value]="null">Unshelved</mat-option>
              @for (shelf of shelves(); track shelf.id) {
                <mat-option [value]="shelf.id">{{ shelf.path }} · {{ shelf.label }}</mat-option>
              }
            </mat-select></mat-form-field
          >
          <mat-form-field class="reason"
            ><mat-label>Reason for move</mat-label
            ><input matInput formControlName="reason" required maxlength="300" /><mat-error
              >Enter a reason for the copy history.</mat-error
            ></mat-form-field
          >
          <div class="move-actions">
            <button mat-flat-button type="submit" [disabled]="moving()">
              <mat-icon>{{ moving() ? 'hourglass_top' : 'drive_file_move' }}</mat-icon>{{
                moving() ? 'Moving…' : 'Move copy'
              }}</button
            ><a mat-button [routerLink]="['/catalogue/copies', copy.id]">Copy details</a>
          </div>
        </form>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .move-error,
      .move-success,
      .blocked-message {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 13px 15px;
        margin-bottom: 18px;
      }
      .move-error,
      .blocked-message {
        border-left: 4px solid var(--mat-sys-error);
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .move-success {
        border-left: 4px solid var(--app-success);
        background: color-mix(in srgb, var(--app-success) 12%, var(--mat-sys-surface));
      }
      .move-search,
      .move-form {
        max-width: 860px;
      }
      .move-search h2,
      .move-form h2 {
        margin: 0 0 14px;
        font: var(--mat-sys-title-large);
      }
      .search-form {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
      }
      .search-form mat-form-field {
        flex: 1 1 280px;
      }
      .search-form button {
        margin: 0 0 20px;
      }
      .inline-error {
        color: var(--mat-sys-error);
      }
      .match-list {
        margin: 0 0 24px;
        border-block: 1px solid var(--mat-sys-outline-variant);
      }
      .copy-match {
        display: grid;
        grid-template-columns: minmax(180px, 1fr) minmax(120px, 1fr) 24px;
        align-items: center;
        width: 100%;
        gap: 12px;
        padding: 12px 10px;
        border: 0;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
        color: inherit;
        background: transparent;
        text-align: left;
        cursor: pointer;
      }
      .copy-match:last-child {
        border-bottom: 0;
      }
      .copy-match--selected {
        background: color-mix(in srgb, var(--mat-sys-primary) 8%, var(--mat-sys-surface));
      }
      .copy-match small {
        display: block;
        margin-top: 3px;
        color: var(--mat-sys-on-surface-variant);
      }
      .copy-match > span:nth-child(2) {
        color: var(--mat-sys-on-surface-variant);
      }
      .move-form {
        padding-top: 20px;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }
      .current-location {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 18px;
        padding: 12px 0;
        border-block: 1px solid var(--mat-sys-outline-variant);
      }
      .current-location span {
        color: var(--mat-sys-on-surface-variant);
      }
      .target-shelf,
      .reason {
        width: min(100%, 620px);
        margin-top: 14px;
      }
      .reason {
        display: block;
      }
      .move-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        padding-bottom: 24px;
      }
      @media (max-width: 600px) {
        .copy-match {
          grid-template-columns: minmax(0, 1fr) 24px;
        }
        .copy-match > span:nth-child(2) {
          grid-column: 1;
          grid-row: 2;
        }
        .copy-match mat-icon {
          grid-column: 2;
          grid-row: 1 / span 2;
        }
      }
    `,
  ],
})
export class MoveCopyPage {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly locations = inject(LocationsService);
  protected readonly searchForm = this.fb.nonNullable.group({ search: ['', Validators.required] });
  protected readonly moveForm = this.fb.group({
    shelfId: this.fb.control<string | null>(null),
    reason: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(300)]),
  });
  protected readonly matches = signal<CopyMatch[]>([]);
  protected readonly selected = signal<CopyMatch | null>(null);
  protected readonly shelves = signal<{ id: string; path: string; label: string }[]>([]);
  protected readonly success = signal<{ accessionNumber: string } | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly searchError = signal<string | null>(null);
  protected readonly searching = signal(false);
  protected readonly moving = signal(false);

  constructor() {
    this.locations.shelves().subscribe({
      next: (result) => this.shelves.set(result.data),
      error: (err: unknown) => this.error.set(toApiError(err).message),
    });
    const shelfId = this.route.snapshot.queryParamMap.get('shelfId');
    if (shelfId) this.moveForm.controls.shelfId.setValue(shelfId);
  }

  protected searchCopies(): void {
    if (this.searchForm.invalid || this.searching()) {
      this.searchForm.markAllAsTouched();
      return;
    }
    this.searching.set(true);
    this.searchError.set(null);
    this.selected.set(null);
    this.matches.set([]);
    this.locations.findCopies(this.searchForm.getRawValue().search.trim()).subscribe({
      next: (result) => {
        this.matches.set(result.data);
        if (!result.data.length) this.searchError.set('No copies match that accession or search.');
        this.searching.set(false);
      },
      error: (err: unknown) => {
        this.searchError.set(toApiError(err).message);
        this.searching.set(false);
      },
    });
  }

  protected selectCopy(copy: CopyMatch): void {
    this.selected.set(copy);
    this.moveForm.controls.shelfId.setValue(copy.shelf?.id ?? null);
    this.moveForm.controls.reason.reset('');
    this.success.set(null);
    this.error.set(null);
  }

  protected move(): void {
    const copy = this.selected();
    if (!copy || this.moveForm.invalid || this.moving()) {
      this.moveForm.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.success.set(null);
    this.moving.set(true);
    const values = this.moveForm.getRawValue();
    this.locations.moveCopy(copy.id, values.shelfId, values.reason.trim()).subscribe({
      next: (result) => {
        this.success.set({ accessionNumber: result.accessionNumber });
        this.selected.set({
          ...copy,
          shelf: this.shelves().find((shelf) => shelf.id === values.shelfId) ?? null,
        });
        this.moving.set(false);
      },
      error: (err: unknown) => {
        this.error.set(toApiError(err).message);
        this.moving.set(false);
      },
    });
  }
}

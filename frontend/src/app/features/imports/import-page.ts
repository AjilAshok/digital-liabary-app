import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { finalize } from 'rxjs';
import { toApiError } from '../../core/api/api';
import { Permissions } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { PageHeader } from '../../shared/ui/page-header';

type Field =
  | 'title'
  | 'authorName'
  | 'authorNumber'
  | 'isbn'
  | 'accessionNumber'
  | 'shelfRack'
  | 'price'
  | 'oldNew'
  | 'condition';
type Values = Record<Field, string>;
interface ImportRow {
  id: string;
  rowNumber: number;
  status: string;
  rawData: { values: Values };
  normalizedData: { values: Values } | null;
  errors: { field: string; message: string }[] | null;
}
interface ImportBatch {
  id: string;
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  importedRows: number;
  rows: ImportRow[];
}

@Component({
  selector: 'app-import-page',
  imports: [FormsModule, MatButtonModule, MatIconModule, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Upload books from Excel"
      description="Review your list before adding books to the library."
    >
      <a mat-stroked-button href="/api/v1/imports/template"
        ><mat-icon>download</mat-icon> Download template</a
      >
    </app-page-header>
    <section class="upload" aria-label="Choose Excel file">
      <label for="workbook">Excel file (.xlsx, up to 5 MB)</label>
      <input
        id="workbook"
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        (change)="chooseFile($event)"
        [disabled]="busy()"
      />
      <button mat-flat-button type="button" (click)="upload()" [disabled]="!file() || busy()">
        <mat-icon>upload_file</mat-icon>{{ busy() ? 'Please wait...' : 'Upload and review' }}
      </button>
    </section>
    @if (error()) {
      <div class="error" role="alert">{{ error() }}</div>
    }
    @if (message()) {
      <div class="message" role="status">{{ message() }}</div>
    }
    @if (batch(); as current) {
      <section class="review" aria-labelledby="review-title">
        <h2 id="review-title">Review: {{ current.fileName }}</h2>
        <p>
          {{ current.validRows }} ready · {{ current.invalidRows }} need changes ·
          {{ current.duplicateRows }} duplicate · {{ current.importedRows }} imported
        </p>
        <div class="actions">
          <button
            mat-flat-button
            type="button"
            (click)="importValid()"
            [disabled]="busy() || !current.validRows || !canConfirm()"
          >
            <mat-icon>library_add</mat-icon> Import ready books
          </button>
          <a mat-stroked-button [href]="'/api/v1/imports/' + current.id + '/errors.xlsx'"
            ><mat-icon>download</mat-icon> Download errors</a
          >
        </div>
        @if (!canConfirm()) {
          <p>You need permission to add books and manage shelves to import.</p>
        }
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Row</th>
                <th>Book</th>
                <th>Book number</th>
                <th>Result</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              @for (row of current.rows; track row.id) {
                <tr>
                  <td>{{ row.rowNumber }}</td>
                  <td>{{ values(row).title || 'Not entered' }}</td>
                  <td>{{ values(row).accessionNumber || 'Not entered' }}</td>
                  <td>
                    <strong>{{ statusLabel(row.status) }}</strong>
                    @for (issue of row.errors || []; track $index) {
                      <div class="issue">{{ fieldLabel(issue.field) }}: {{ issue.message }}</div>
                    }
                  </td>
                  <td>
                    @if (row.status !== 'IMPORTED') {
                      <button mat-button type="button" (click)="edit(row)" [disabled]="busy()">
                        Edit
                      </button>
                    }
                  </td>
                </tr>
                @if (editingId() === row.id) {
                  <tr>
                    <td colspan="5">
                      <div class="editor">
                        @for (field of fields; track field.key) {
                          <label
                            >{{ field.label
                            }}<input
                              [type]="field.key === 'price' ? 'text' : 'text'"
                              [(ngModel)]="draft[field.key]"
                              [name]="field.key"
                              [disabled]="busy()"
                          /></label>
                        }
                        <div class="actions">
                          <button
                            mat-flat-button
                            type="button"
                            (click)="saveRow(row)"
                            [disabled]="busy()"
                          >
                            Save changes</button
                          ><button
                            mat-button
                            type="button"
                            (click)="editingId.set(null)"
                            [disabled]="busy()"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      </section>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .upload,
      .actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
      }
      .upload {
        padding: 18px 0;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
      .upload label {
        font-weight: 600;
      }
      .review {
        margin-top: 24px;
      }
      h2 {
        font: var(--mat-sys-title-large);
      }
      .table-wrap {
        overflow-x: auto;
        margin-top: 16px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
      }
      th,
      td {
        padding: 12px;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
        vertical-align: top;
      }
      th {
        font: var(--mat-sys-label-large);
      }
      .issue {
        margin-top: 4px;
        color: var(--mat-sys-error);
      }
      .error,
      .message {
        margin: 16px 0;
        padding: 12px;
        border-left: 4px solid;
      }
      .error {
        color: var(--mat-sys-on-error-container);
        background: var(--mat-sys-error-container);
      }
      .message {
        background: var(--mat-sys-secondary-container);
      }
      .editor {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
        gap: 12px;
      }
      .editor label {
        display: grid;
        gap: 5px;
      }
      .editor input {
        padding: 9px;
        min-width: 0;
        border: 1px solid var(--mat-sys-outline);
        border-radius: 4px;
        font: inherit;
        background: var(--mat-sys-surface);
        color: var(--mat-sys-on-surface);
      }
      .editor .actions {
        grid-column: 1 / -1;
      }
    `,
  ],
})
export class ImportPage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  protected readonly file = signal<File | null>(null);
  protected readonly batch = signal<ImportBatch | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly canConfirm = computed(() => {
    this.auth.user();
    return this.auth.hasAllPermissions([
      'imports.manage',
      Permissions.CATALOGUE_WRITE,
      Permissions.COPIES_WRITE,
      Permissions.LOCATIONS_MANAGE,
    ]);
  });
  protected readonly fields: { key: Field; label: string }[] = [
    { key: 'title', label: 'Book name' },
    { key: 'authorName', label: 'Author name' },
    { key: 'authorNumber', label: 'Author number' },
    { key: 'isbn', label: 'ISBN' },
    { key: 'accessionNumber', label: 'Book number' },
    { key: 'shelfRack', label: 'Shelf or full location' },
    { key: 'price', label: 'Price' },
    { key: 'oldNew', label: 'Old or new' },
    { key: 'condition', label: 'Condition' },
  ];
  protected draft: Values = this.emptyValues();

  protected chooseFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file.set(input.files?.[0] ?? null);
    this.error.set(null);
  }
  protected upload(): void {
    const file = this.file();
    if (!file || this.busy()) return;
    const body = new FormData();
    body.append('file', file);
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
    this.http
      .post<ImportBatch>('/api/v1/imports/upload', body)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (batch) => {
          this.batch.set(batch);
          this.editingId.set(null);
          this.message.set('Excel file uploaded. Review the rows before importing.');
        },
        error: (error: unknown) => this.error.set(toApiError(error).message),
      });
  }
  protected values(row: ImportRow): Values {
    return row.normalizedData?.values ?? row.rawData.values;
  }
  protected edit(row: ImportRow): void {
    this.draft = { ...this.values(row) };
    this.editingId.set(row.id);
  }
  protected saveRow(row: ImportRow): void {
    const batch = this.batch();
    if (!batch || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.http
      .patch<ImportBatch>(`/api/v1/imports/${batch.id}/rows/${row.id}`, this.draft)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (updated) => {
          this.batch.set(updated);
          this.editingId.set(null);
          this.message.set('Changes saved.');
        },
        error: (error: unknown) => this.error.set(toApiError(error).message),
      });
  }
  protected importValid(): void {
    const batch = this.batch();
    if (!batch || this.busy()) return;
    const rowIds = batch.rows
      .filter((row) => row.status === 'VALID')
      .slice(0, 100)
      .map((row) => row.id);
    if (!rowIds.length) return;
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
    this.http
      .post<ImportBatch>(`/api/v1/imports/${batch.id}/confirm`, { rowIds })
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (updated) => {
          this.batch.set(updated);
          this.message.set(
            updated.validRows
              ? 'Books added. More rows are ready to import.'
              : 'Ready books added successfully.',
          );
        },
        error: (error: unknown) => this.error.set(toApiError(error).message),
      });
  }
  protected statusLabel(status: string): string {
    return (
      (
        {
          VALID: 'Ready',
          INVALID: 'Needs changes',
          DUPLICATE: 'Duplicate book number',
          IMPORTED: 'Imported',
        } as Record<string, string>
      )[status] ?? status
    );
  }
  protected fieldLabel(field: string): string {
    return this.fields.find((item) => item.key === field)?.label ?? field;
  }
  private emptyValues(): Values {
    return {
      title: '',
      authorName: '',
      authorNumber: '',
      isbn: '',
      accessionNumber: '',
      shelfRack: '',
      price: '',
      oldNew: '',
      condition: '',
    };
  }
}

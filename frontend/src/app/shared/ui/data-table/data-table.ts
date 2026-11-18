import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  TemplateRef,
  computed,
  contentChildren,
  inject,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';

export interface TableColumn<T> {
  /** Unique column id; also the sort key emitted in `sortChange`. */
  key: string;
  header: string;
  /** Plain-text cell value. Ignored when an `appCell` template exists for this key. */
  value?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  align?: 'start' | 'end';
  /** Hide the column below 600px wide. */
  hideOnMobile?: boolean;
}

/** Custom cell template: `<ng-template appCell="status" let-row>…</ng-template>`. */
@Directive({ selector: 'ng-template[appCell]' })
export class CellDef {
  readonly appCell = input.required<string>();
  readonly template = inject<TemplateRef<{ $implicit: unknown }>>(TemplateRef);
}

/**
 * Server-driven table: the parent owns data loading and reacts to `pageChange`/`sortChange`.
 * Built-in loading, empty and error states; horizontally scrollable on small screens.
 */
@Component({
  selector: 'app-data-table',
  imports: [
    NgTemplateOutlet,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './data-table.html',
  styleUrl: './data-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTable<T> {
  readonly columns = input.required<TableColumn<T>[]>();
  readonly rows = input.required<T[]>();
  readonly total = input(0);
  readonly pageIndex = input(0);
  readonly pageSize = input(20);
  readonly pageSizeOptions = input([10, 20, 50, 100]);
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly emptyMessage = input('No records found.');
  readonly ariaLabel = input.required<string>();
  readonly sortActive = input('');
  readonly sortDirection = input<'asc' | 'desc' | ''>('');
  readonly rowsClickable = input(false);
  readonly trackBy = input<(row: T) => unknown>((row: T) => row);

  readonly pageChange = output<PageEvent>();
  readonly sortChange = output<Sort>();
  readonly retry = output<void>();
  readonly rowClick = output<T>();

  private readonly cellDefs = contentChildren(CellDef);
  protected readonly templates = computed(
    () => new Map(this.cellDefs().map((d) => [d.appCell(), d.template])),
  );
  protected readonly displayedColumns = computed(() => this.columns().map((c) => c.key));
  protected readonly showEmpty = computed(
    () => !this.loading() && !this.error() && this.rows().length === 0,
  );

  protected cellText(column: TableColumn<T>, row: T): string {
    const value = column.value?.(row);
    return value === null || value === undefined || value === '' ? '—' : String(value);
  }

  protected onRowActivate(row: T): void {
    if (this.rowsClickable()) this.rowClick.emit(row);
  }
}

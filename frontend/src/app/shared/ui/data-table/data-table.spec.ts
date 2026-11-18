import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CellDef, DataTable, TableColumn } from './data-table';

interface Row {
  id: number;
  name: string;
  count: number | null;
}

@Component({
  imports: [DataTable, CellDef],
  template: `
    <app-data-table
      ariaLabel="Test rows"
      [columns]="columns"
      [rows]="rows()"
      [total]="rows().length"
      [loading]="loading()"
      [error]="error()"
      [rowsClickable]="true"
      emptyMessage="Nothing here"
      (rowClick)="clicked = $event"
      (retry)="retried = true"
      (pageChange)="pageIndex = $event.pageIndex"
    >
      <ng-template appCell="name" let-row
        ><strong class="custom">{{ row.name }}!</strong></ng-template
      >
    </app-data-table>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  columns: TableColumn<Row>[] = [
    { key: 'name', header: 'Name' },
    { key: 'count', header: 'Count', value: (r) => r.count, align: 'end' },
  ];
  rows = signal<Row[]>([
    { id: 1, name: 'Alpha', count: 3 },
    { id: 2, name: 'Beta', count: null },
  ]);
  loading = signal(false);
  error = signal<string | null>(null);
  clicked: Row | null = null;
  retried = false;
  pageIndex = 0;
}

describe('DataTable', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('renders headers, values and custom cell templates', async () => {
    const { el } = await setup();
    const headers = [...el.querySelectorAll('th')].map((h) => h.textContent?.trim());
    expect(headers).toEqual(['Name', 'Count']);
    expect(el.querySelector('.custom')?.textContent).toBe('Alpha!');
    const cells = [...el.querySelectorAll('td')].map((c) => c.textContent?.trim());
    expect(cells).toEqual(['Alpha!', '3', 'Beta!', '—']);
  });

  it('emits rowClick on click and Enter', async () => {
    const { fixture, host, el } = await setup();
    el.querySelector<HTMLElement>('tr[mat-row]')!.click();
    expect(host.clicked?.id).toBe(1);
    el.querySelectorAll<HTMLElement>('tr[mat-row]')[1]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter' }),
    );
    fixture.detectChanges();
    expect(host.clicked?.id).toBe(2);
  });

  it('shows the empty state', async () => {
    const { fixture, host, el } = await setup();
    host.rows.set([]);
    await fixture.whenStable();
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Nothing here');
  });

  it('shows the error state with retry instead of the table', async () => {
    const { fixture, host, el } = await setup();
    host.error.set('Server unavailable');
    await fixture.whenStable();
    expect(el.querySelector('table')).toBeNull();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Server unavailable');
    el.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    expect(host.retried).toBe(true);
  });

  it('shows a progress bar and marks itself busy while loading', async () => {
    const { fixture, host, el } = await setup();
    host.loading.set(true);
    await fixture.whenStable();
    expect(el.querySelector('mat-progress-bar')).not.toBeNull();
    expect(el.querySelector('.data-table')?.getAttribute('aria-busy')).toBe('true');
  });
});

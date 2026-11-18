import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { PageEvent } from '@angular/material/paginator';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CopyRow } from './catalogue.service';
import { CopiesPage } from './copies-page';

const COPY: CopyRow = {
  id: 'copy-1',
  accessionNumber: 'ACC-101',
  status: 'AVAILABLE',
  condition: 'GOOD',
  acquisitionType: 'LEGACY_OLD_STOCK',
  acquisitionDate: null,
  acquisitionPrice: '0.00',
  shelf: { id: 'shelf-1', path: 'Main / R01 / S1' },
  edition: {
    id: 'edition-1',
    isbn13: '9780306406157',
    editionStatement: 'Second edition',
    publicationYear: null,
  },
  book: { id: 'book-1', title: 'The Book', authors: [{ name: 'A Writer', authorNumber: 'AU-12' }] },
  createdAt: '2026-01-01T00:00:00Z',
};

describe('CopiesPage', () => {
  let fixture: ComponentFixture<CopiesPage>;
  let http: HttpTestingController;

  async function setup(canWrite: boolean) {
    TestBed.configureTestingModule({
      imports: [CopiesPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(AuthService).setUser({
      id: 'user-1',
      email: 'user@example.test',
      fullName: 'Library User',
      roles: [],
      permissions: canWrite ? ['copies.read', 'copies.write'] : ['copies.read'],
      lastLoginAt: null,
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CopiesPage);
    await fixture.whenStable();
  }

  function respond(rows: CopyRow[] = [COPY]) {
    const request = http.expectOne((req) => req.url === '/api/v1/copies');
    request.flush({
      data: rows,
      meta: { page: 1, pageSize: 20, total: rows.length, totalPages: 1 },
    });
    return request;
  }

  afterEach(() => http.verify());

  it('displays inventory data, missing values and permitted copy actions', async () => {
    await setup(true);
    respond([
      COPY,
      {
        ...COPY,
        id: 'copy-2',
        accessionNumber: 'ACC-102',
        acquisitionType: 'PURCHASED_NEW',
        acquisitionPrice: null,
        shelf: null,
        edition: { ...COPY.edition, isbn13: null, editionStatement: null },
      },
    ]);
    await fixture.whenStable();
    const rows = fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLElement>;
    expect(rows[0].textContent).toContain('The Book');
    expect(rows[0].textContent).toContain('A Writer');
    expect(rows[0].textContent).toContain('AU-12');
    expect(rows[0].textContent).toContain('Second edition');
    expect(rows[0].textContent).toContain('ACC-101');
    expect(rows[0].textContent).toContain('9780306406157');
    expect(rows[0].textContent).toContain('Main / R01 / S1');
    expect(rows[0].textContent).toContain('0.00');
    expect(rows[0].textContent).toContain('Old stock');
    expect(rows[0].textContent).toContain('Available');
    expect(rows[0].querySelector('a[aria-label="View copy ACC-101"]')?.getAttribute('href')).toBe(
      '/catalogue/copies/copy-1',
    );
    expect(rows[0].querySelector('a[aria-label="Edit copy ACC-101"]')?.getAttribute('href')).toBe(
      '/catalogue/copies/copy-1',
    );
    expect(rows[1].textContent).toContain('New stock');
    expect(rows[1].textContent).toContain('Unshelved');
    expect(rows[1].textContent?.match(/Not recorded/g)).toHaveLength(2);
  });

  it('hides edit without permission and retains filtering and pagination', async () => {
    await setup(false);
    respond();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('a[aria-label="Edit copy ACC-101"]')).toBeNull();

    const page = fixture.componentInstance as unknown as {
      status: FormControl<string>;
      stock: FormControl<string>;
      changePage(event: PageEvent): void;
    };
    page.status.setValue('AVAILABLE');
    expect(respond().request.params.get('status')).toBe('AVAILABLE');
    page.stock.setValue('old');
    expect(respond().request.params.get('stock')).toBe('old');
    page.changePage({ pageIndex: 1, pageSize: 10, length: 20 });
    const request = respond();
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('10');
    expect(request.request.params.get('status')).toBe('AVAILABLE');
    expect(request.request.params.get('stock')).toBe('old');
  });
});

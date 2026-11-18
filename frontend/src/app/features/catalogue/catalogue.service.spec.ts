import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CatalogueService } from './catalogue.service';

describe('CatalogueService', () => {
  let service: CatalogueService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CatalogueService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests a paginated book search from the live catalogue API', () => {
    let response: unknown;
    service.books(2, 10, 'Mary Shelley').subscribe((value) => (response = value));

    const request = http.expectOne((req) => req.url === '/api/v1/books');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('10');
    expect(request.request.params.get('search')).toBe('Mary Shelley');
    request.flush({ data: [], meta: { page: 2, pageSize: 10, total: 0, totalPages: 0 } });
    expect(response).toEqual({
      data: [],
      meta: { page: 2, pageSize: 10, total: 0, totalPages: 0 },
    });
  });

  it('checks ISBNs against existing editions so another copy can be registered', () => {
    let matches: unknown;
    service.lookupIsbn('9780306406157').subscribe((value) => (matches = value));

    const request = http.expectOne((req) => req.url === '/api/v1/editions/lookup');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('isbn')).toBe('9780306406157');
    request.flush({
      isbn13: '9780306406157',
      matches: [
        {
          editionId: 'edition-1',
          bookId: 'book-1',
          title: 'Existing title',
          editionStatement: null,
        },
      ],
    });
    expect(matches).toEqual({
      isbn13: '9780306406157',
      matches: [
        {
          editionId: 'edition-1',
          bookId: 'book-1',
          title: 'Existing title',
          editionStatement: null,
        },
      ],
    });
  });

  it('registers physical copies under an existing edition with the requested accession policy', () => {
    const input = {
      quantity: 2,
      accessionMode: 'manual' as const,
      accessionNumbers: ['OLD-101', 'OLD-102'],
      acquisitionType: 'LEGACY_OLD_STOCK' as const,
      acquisitionDate: null,
      acquisitionPrice: null,
      condition: 'GOOD' as const,
      status: 'AVAILABLE' as const,
      shelfId: null,
      remarks: null,
    };
    let result: unknown;
    service.registerCopies('edition-1', input).subscribe((value) => (result = value));

    const request = http.expectOne('/api/v1/editions/edition-1/copies');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    request.flush({
      bookId: 'book-1',
      editionId: 'edition-1',
      copies: [
        { id: 'copy-1', accessionNumber: 'OLD-101', status: 'AVAILABLE' },
        { id: 'copy-2', accessionNumber: 'OLD-102', status: 'AVAILABLE' },
      ],
    });
    expect(result).toEqual({
      bookId: 'book-1',
      editionId: 'edition-1',
      copies: [
        { id: 'copy-1', accessionNumber: 'OLD-101', status: 'AVAILABLE' },
        { id: 'copy-2', accessionNumber: 'OLD-102', status: 'AVAILABLE' },
      ],
    });
  });

  it('loads physical stock and transaction history in pages for book details', () => {
    let response: unknown;
    service.bookStock('book-1', 2, 10).subscribe((value) => (response = value));
    const request = http.expectOne('/api/v1/books/book-1/stock?page=2&pageSize=10');
    expect(request.request.method).toBe('GET');
    request.flush({
      data: [
        {
          id: 'copy-1',
          accessionNumber: 'ACC-1',
          status: 'AVAILABLE',
          condition: 'GOOD',
          acquisitionType: 'PURCHASED_NEW',
          acquisitionDate: null,
          acquisitionPrice: '25.00',
          edition: { id: 'edition-1', editionStatement: null, isbn13: '9780306406157' },
          shelf: { id: 'shelf-1', path: 'MAIN / G / GEN / R01 / S1' },
          supplier: { id: 'supplier-1', name: 'Books Ltd' },
          purchase: {
            invoiceNumber: 'INV-1',
            invoiceDate: '2026-01-01',
            status: 'RECEIVED',
            supplier: 'Books Ltd',
            unitPrice: '25.00',
          },
          transactions: [
            {
              id: 'loan-1',
              status: 'RETURNED',
              issuedAt: '',
              dueAt: '',
              returnedAt: '',
              member: { fullName: 'Member One', membershipNumber: 'M1' },
              renewals: [],
            },
          ],
          history: [],
        },
      ],
      meta: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
    });
    expect(response).toMatchObject({
      meta: { page: 2, total: 11 },
      data: [{ purchase: { invoiceNumber: 'INV-1' }, transactions: [{ id: 'loan-1' }] }],
    });
  });
});

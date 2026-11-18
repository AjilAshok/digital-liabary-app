import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SearchService } from './search.service';

describe('SearchService', () => {
  let service: SearchService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SearchService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends the query, filters, sort and pagination to the database search endpoint', () => {
    let response: unknown;
    service
      .search({
        q: 'The Great Gatsby',
        page: 2,
        pageSize: 10,
        sort: 'relevance',
        categoryId: 'category-1',
        publisherId: 'publisher-1',
        stockType: 'old',
        status: 'AVAILABLE',
        shelfId: 'shelf-1',
        rackId: 'rack-1',
      })
      .subscribe((value) => (response = value));

    const request = http.expectOne((req) => req.url === '/api/v1/search');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('q')).toBe('The Great Gatsby');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('10');
    expect(request.request.params.get('sort')).toBe('relevance');
    expect(request.request.params.get('categoryId')).toBe('category-1');
    expect(request.request.params.get('publisherId')).toBe('publisher-1');
    expect(request.request.params.get('stockType')).toBe('old');
    expect(request.request.params.get('status')).toBe('AVAILABLE');
    expect(request.request.params.get('shelfId')).toBe('shelf-1');
    expect(request.request.params.get('rackId')).toBe('rack-1');
    request.flush({
      books: { data: [], meta: { page: 2, pageSize: 10, total: 0, totalPages: 0 } },
      authors: [],
      exactCopy: null,
    });
    expect(response).toEqual({
      books: { data: [], meta: { page: 2, pageSize: 10, total: 0, totalPages: 0 } },
      authors: [],
      exactCopy: null,
    });
  });
});

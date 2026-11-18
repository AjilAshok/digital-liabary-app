import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LocationsService } from './locations.service';

describe('LocationsService', () => {
  let service: LocationsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(LocationsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the nested location hierarchy', () => {
    let response: unknown;
    service.tree().subscribe((value) => (response = value));
    const request = http.expectOne('/api/v1/locations/tree');
    expect(request.request.method).toBe('GET');
    request.flush({ data: [{ id: 'building-1', code: 'MAIN', name: 'Main', floors: [] }] });
    expect(response).toMatchObject({ data: [{ code: 'MAIN' }] });
  });

  it('requests a paginated shelf report filtered by shelf code', () => {
    service.shelfReport(2, 10, 'S-12').subscribe();
    const request = http.expectOne((req) => req.url === '/api/v1/locations/reports/shelves');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('10');
    expect(request.request.params.get('search')).toBe('S-12');
    request.flush({ data: [], meta: { page: 2, pageSize: 10, total: 0, totalPages: 0 } });
  });

  it('creates and edits locations through level-scoped endpoints', () => {
    service
      .create('buildings', { code: 'MAIN', name: 'Main', address: '1 Library Way' })
      .subscribe();
    const create = http.expectOne('/api/v1/locations/buildings');
    expect(create.request.method).toBe('POST');
    create.flush({ id: 'building-1' });

    service.update('shelves', 'shelf-1', { code: 'S-2', capacity: 24 }).subscribe();
    const update = http.expectOne('/api/v1/locations/shelves/shelf-1');
    expect(update.request.method).toBe('PATCH');
    expect(update.request.body).toEqual({ code: 'S-2', capacity: 24 });
    update.flush({ id: 'shelf-1' });
  });

  it('moves a physical copy through the location API with a reason', () => {
    service.moveCopy('copy-1', 'shelf-2', 'Reorganizing history collection').subscribe();
    const request = http.expectOne('/api/v1/locations/copies/copy-1/move');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      shelfId: 'shelf-2',
      reason: 'Reorganizing history collection',
    });
    request.flush({
      id: 'copy-1',
      accessionNumber: 'ACC-1',
      fromShelfId: 'shelf-1',
      toShelfId: 'shelf-2',
    });
  });
});

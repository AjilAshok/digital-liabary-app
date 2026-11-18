import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthorsService } from './authors.service';

describe('AuthorsService', () => {
  let service: AuthorsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthorsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('searches authors by name or author number with pagination', () => {
    let response: unknown;
    service.list(2, 10, 'L-42').subscribe((value) => (response = value));

    const request = http.expectOne((req) => req.url === '/api/v1/authors');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('10');
    expect(request.request.params.get('search')).toBe('L-42');
    request.flush({
      data: [
        { id: 'author-1', name: 'Ursula K. Le Guin', authorNumber: 'L-42', titles: 4, copies: 9 },
      ],
      meta: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
    });
    expect(response).toEqual({
      data: [
        { id: 'author-1', name: 'Ursula K. Le Guin', authorNumber: 'L-42', titles: 4, copies: 9 },
      ],
      meta: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
    });
  });

  it('creates authors with their optional profile fields', () => {
    const input = {
      name: 'Ursula K. Le Guin',
      authorNumber: 'L-42',
      description: 'Writer',
      nationality: 'American',
      dateOfBirth: '1929-10-21',
    };
    service.create(input).subscribe();
    const request = http.expectOne('/api/v1/authors');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    request.flush({ ...input, id: 'author-1', titles: 0, copies: 0 });
  });

  it('loads author profiles with linked titles and copy totals', () => {
    let response: unknown;
    service.get('author-1').subscribe((value) => (response = value));
    const request = http.expectOne('/api/v1/authors/author-1');
    expect(request.request.method).toBe('GET');
    request.flush({
      id: 'author-1',
      name: 'Ursula K. Le Guin',
      authorNumber: null,
      description: null,
      nationality: null,
      dateOfBirth: null,
      titles: 1,
      copies: 2,
      createdAt: '',
      updatedAt: '',
      books: [
        {
          id: 'book-1',
          title: 'The Dispossessed',
          subtitle: null,
          role: 'AUTHOR',
          copies: { holdings: 2, available: 2 },
          editions: [],
        },
      ],
    });
    expect(response).toMatchObject({ titles: 1, copies: 2, books: [{ id: 'book-1' }] });
  });
});

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ScannerService } from './scanner.service';

describe('ScannerService', () => {
  let service: ScannerService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ScannerService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('submits the raw ISBN to the local-first scan lookup endpoint', () => {
    service.lookupIsbn('0-306-40615-2').subscribe();
    const request = http.expectOne('/api/v1/scanner/isbn-lookup');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ isbn: '0-306-40615-2' });
    request.flush({
      valid: true,
      isbn13: '9780306406157',
      localMatches: [],
      suggestions: [],
      providerErrors: [],
    });
  });

  it('uploads the selected cover image as multipart form data', () => {
    const cover = new File(['cover-bytes'], 'cover.png', { type: 'image/png' });
    service.lookupCover(cover).subscribe();
    const request = http.expectOne('/api/v1/scanner/cover-ocr');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeInstanceOf(FormData);
    expect((request.request.body as FormData).get('cover')).toBe(cover);
    request.flush({
      provider: 'GOOGLE_CLOUD_VISION',
      confidence: 0.9,
      extractedText: 'A Book',
      fields: { title: 'A Book', authors: [], publisher: null },
      local: null,
      suggestions: [],
      providerErrors: [],
    });
  });

  it('creates only reviewed bibliographic metadata, not a physical copy', () => {
    const input = {
      provider: 'GOOGLE_BOOKS' as const,
      externalId: 'volume-1',
      isbn: '9780306406157',
      title: 'Reviewed Title',
      subtitle: null,
      editionStatement: 'First edition',
      authors: ['A. Writer'],
      publisher: 'Publisher',
      publicationYear: 2020,
      description: null,
      language: 'en',
      pageCount: 220,
      confidence: 0.96,
    };
    service.confirmMetadata(input).subscribe();
    const request = http.expectOne('/api/v1/scanner/confirm-metadata');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    request.flush({ bookId: 'book-1', editionId: 'edition-1', title: 'Reviewed Title' });
  });
});

import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL, Paginated } from '../../core/api/api';

export interface BookRow {
  id: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  category: string | null;
  editions: number;
  isbns: string[];
  publishers: string[];
  copies: { holdings: number; available: number };
  createdAt: string;
}

export interface BookDetails {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  originalLanguage: string | null;
  category: { id: string; name: string } | null;
  authors: { id: string; name: string; authorNumber: string | null; role: string }[];
  editions: Edition[];
  copyStats: {
    holdings: number;
    byStatus: Record<string, number>;
    byAcquisition: Record<string, number>;
  };
}

export interface Edition {
  id: string;
  isbn13: string | null;
  isbn10: string | null;
  editionStatement: string | null;
  publisher: { id: string; name: string } | null;
  publicationYear: number | null;
  language: string | null;
  pageCount: number | null;
  format: string | null;
  hasCover: boolean;
  metadataSource: string;
  copies: { holdings: number; available: number };
}

export interface CopyRow {
  id: string;
  accessionNumber: string;
  status: string;
  condition: string;
  acquisitionType: AcquisitionType;
  acquisitionDate: string | null;
  acquisitionPrice: string | null;
  shelf: { id: string; path: string } | null;
  edition: {
    id: string;
    isbn13: string | null;
    editionStatement: string | null;
    publicationYear: number | null;
  };
  book: { id: string; title: string; authors?: { name: string; authorNumber: string | null }[] };
  createdAt: string;
}

export interface CopyDetails extends CopyRow {
  barcode: string | null;
  remarks: string | null;
  archived: boolean;
  activeLoan: { issuedAt: string; dueAt: string } | null;
  supplier: { id: string; name: string } | null;
  purchase: {
    invoiceNumber: string | null;
    invoiceDate: string | null;
    status: string;
    supplier: string;
    unitPrice: string;
  } | null;
  transactions: {
    id: string;
    status: string;
    issuedAt: string;
    dueAt: string;
    returnedAt: string | null;
    member: { fullName: string; membershipNumber: string };
    renewals: { previousDueAt: string; newDueAt: string; createdAt: string }[];
  }[];
  history: {
    id: string;
    eventType: string;
    reason: string | null;
    changedBy: string | null;
    createdAt: string;
  }[];
}

export interface BookStockRow {
  id: string;
  accessionNumber: string;
  status: string;
  condition: string;
  acquisitionType: AcquisitionType;
  acquisitionDate: string | null;
  acquisitionPrice: string | null;
  edition: { id: string; editionStatement: string | null; isbn13: string | null };
  shelf: { id: string; path: string } | null;
  supplier: { id: string; name: string } | null;
  purchase: {
    invoiceNumber: string | null;
    invoiceDate: string | null;
    status: string;
    supplier: string;
    unitPrice: string;
  } | null;
  transactions: CopyDetails['transactions'];
  history: CopyDetails['history'];
}

export interface LookupOption {
  id: string;
  name: string;
  authorNumber?: string | null;
  path?: string;
}

export type AcquisitionType =
  'LEGACY_OLD_STOCK' | 'PURCHASED_NEW' | 'DONATED' | 'TRANSFERRED' | 'OTHER';
export type CopyCondition = 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED';
export type CopyStatus =
  | 'AVAILABLE'
  | 'ISSUED'
  | 'RESERVED'
  | 'DAMAGED'
  | 'MISSING'
  | 'UNDER_REPAIR'
  | 'DISCARDED'
  | 'PENDING_VERIFICATION';

export interface BookInput {
  title: string;
  subtitle: string | null;
  description: string | null;
  originalLanguage: string | null;
  categoryId: string | null;
  authors: { authorId: string; role: 'AUTHOR' }[];
}

export interface EditionInput {
  isbn: string | null;
  editionStatement: string | null;
  publisherId: string | null;
  publicationYear: number | null;
  language: string | null;
  pageCount: number | null;
  format: string | null;
}

export interface RegisterCopiesInput {
  quantity: number;
  accessionMode: 'auto' | 'manual';
  accessionNumbers?: string[];
  acquisitionType: AcquisitionType;
  acquisitionDate: string | null;
  acquisitionPrice: string | null;
  condition: CopyCondition;
  status: CopyStatus;
  shelfId: string | null;
  remarks: string | null;
}

export interface IsbnLookupResult {
  isbn13: string;
  matches: { editionId: string; bookId: string; title: string; editionStatement: string | null }[];
}

@Injectable({ providedIn: 'root' })
export class CatalogueService {
  private readonly http = inject(HttpClient);
  private readonly base = API_BASE_URL;

  books(page: number, pageSize: number, search: string): Observable<Paginated<BookRow>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (search.trim()) params = params.set('search', search.trim());
    return this.http.get<Paginated<BookRow>>(`${this.base}/books`, { params });
  }

  book(id: string): Observable<BookDetails> {
    return this.http.get<BookDetails>(`${this.base}/books/${id}`);
  }

  bookStock(id: string, page: number, pageSize: number): Observable<Paginated<BookStockRow>> {
    return this.http.get<Paginated<BookStockRow>>(`${this.base}/books/${id}/stock`, {
      params: new HttpParams().set('page', page).set('pageSize', pageSize),
    });
  }

  lookupIsbn(isbn: string): Observable<IsbnLookupResult> {
    return this.http.get<IsbnLookupResult>(`${this.base}/editions/lookup`, { params: { isbn } });
  }

  createBook(
    book: BookInput,
    edition: EditionInput,
    confirmNewTitle = false,
  ): Observable<BookDetails> {
    return this.http.post<BookDetails>(`${this.base}/books`, { ...book, edition, confirmNewTitle });
  }

  updateBook(id: string, input: BookInput): Observable<BookDetails> {
    return this.http.put<BookDetails>(`${this.base}/books/${id}`, input);
  }

  addEdition(bookId: string, input: EditionInput): Observable<{ id: string; bookId: string }> {
    return this.http.post<{ id: string; bookId: string }>(
      `${this.base}/books/${bookId}/editions`,
      input,
    );
  }

  updateEdition(id: string, input: EditionInput): Observable<{ id: string; bookId: string }> {
    return this.http.put<{ id: string; bookId: string }>(`${this.base}/editions/${id}`, input);
  }

  uploadCover(editionId: string, file: File): Observable<void> {
    const body = new FormData();
    body.append('cover', file);
    return this.http.post<void>(`${this.base}/editions/${editionId}/cover`, body);
  }

  removeCover(editionId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/editions/${editionId}/cover`);
  }

  copies(
    page: number,
    pageSize: number,
    filters: Record<string, string>,
  ): Observable<Paginated<CopyRow>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    for (const [key, value] of Object.entries(filters)) {
      if (value) params = params.set(key, value);
    }
    return this.http.get<Paginated<CopyRow>>(`${this.base}/copies`, { params });
  }

  copy(id: string): Observable<CopyDetails> {
    return this.http.get<CopyDetails>(`${this.base}/copies/${id}`);
  }

  registerCopies(editionId: string, input: RegisterCopiesInput) {
    return this.http.post<{
      bookId: string;
      editionId: string;
      copies: { id: string; accessionNumber: string; status: string }[];
    }>(`${this.base}/editions/${editionId}/copies`, input);
  }

  updateCopy(id: string, input: Record<string, unknown>): Observable<CopyDetails> {
    return this.http.patch<CopyDetails>(`${this.base}/copies/${id}`, input);
  }

  authors(search = ''): Observable<Paginated<LookupOption>> {
    let params = new HttpParams().set('page', 1).set('pageSize', 100);
    if (search) params = params.set('search', search);
    return this.http.get<Paginated<LookupOption>>(`${this.base}/authors`, { params });
  }

  createAuthor(name: string, authorNumber: string): Observable<LookupOption> {
    return this.http.post<LookupOption>(`${this.base}/authors`, { name, authorNumber });
  }

  publishers(search = ''): Observable<Paginated<LookupOption>> {
    let params = new HttpParams().set('page', 1).set('pageSize', 100);
    if (search) params = params.set('search', search);
    return this.http.get<Paginated<LookupOption>>(`${this.base}/publishers`, {
      params,
    });
  }

  categories(): Observable<{ data: LookupOption[] }> {
    return this.http.get<{ data: LookupOption[] }>(`${this.base}/categories`);
  }

  shelves(): Observable<{ data: { id: string; path: string; label: string }[] }> {
    return this.http.get<{ data: { id: string; path: string; label: string }[] }>(
      `${this.base}/locations/shelves`,
    );
  }
}

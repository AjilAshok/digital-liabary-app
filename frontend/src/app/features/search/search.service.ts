import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL, Paginated } from '../../core/api/api';
import { CopyDetails, CopyStatus } from '../catalogue/catalogue.service';

export interface SearchFilters {
  q: string;
  page: number;
  pageSize: number;
  sort: 'relevance' | 'title' | '-title' | 'newest';
  categoryId: string;
  publisherId: string;
  stockType: '' | 'old' | 'new';
  status: '' | CopyStatus;
  shelfId: string;
  rackId: string;
}

export interface SearchCopy {
  id: string;
  accessionNumber: string;
  status: CopyStatus;
  condition: string;
  acquisitionType: string;
  shelf: { id: string; path: string } | null;
}

export interface SearchEdition {
  id: string;
  isbn13: string | null;
  isbn10: string | null;
  editionStatement: string | null;
  publicationYear: number | null;
  publisher: string | null;
  copyCount: number;
  copiesTruncated: boolean;
  copies: SearchCopy[];
}

export interface SearchBook {
  id: string;
  title: string;
  subtitle: string | null;
  category: string | null;
  score: number;
  authors: { id: string; name: string; authorNumber: string | null; role: string }[];
  editions: SearchEdition[];
}

export interface SearchAuthor {
  id: string;
  name: string;
  authorNumber: string | null;
  description: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  titles: number;
  copies: number;
  books: {
    id: string;
    title: string;
    subtitle: string | null;
    category: string | null;
    role: string;
    editions: {
      id: string;
      isbn13: string | null;
      editionStatement: string | null;
      publicationYear: number | null;
      publisher: string | null;
      copies: { holdings: number; available: number };
    }[];
  }[];
}

export interface SearchResponse {
  books: Paginated<SearchBook>;
  authors: SearchAuthor[];
  exactCopy: CopyDetails | null;
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly http = inject(HttpClient);

  search(filters: SearchFilters): Observable<SearchResponse> {
    let params = new HttpParams()
      .set('q', filters.q)
      .set('page', filters.page)
      .set('pageSize', filters.pageSize)
      .set('sort', filters.sort);
    for (const key of [
      'categoryId',
      'publisherId',
      'stockType',
      'status',
      'shelfId',
      'rackId',
    ] as const) {
      const value = filters[key];
      if (value) params = params.set(key, value);
    }
    return this.http.get<SearchResponse>(`${API_BASE_URL}/search`, { params });
  }
}

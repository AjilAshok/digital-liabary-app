import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../../core/api/api';
import { SearchResponse } from '../search/search.service';

export interface LocalEditionMatch {
  editionId: string;
  bookId: string;
  title: string;
  subtitle: string | null;
  authors: { id: string; name: string; authorNumber: string | null; role: string }[];
  category: string | null;
  editionStatement: string | null;
  publisher: string | null;
  publicationYear: number | null;
  isbn13: string | null;
  isbn10: string | null;
  copies: number;
  available: number;
}

export interface MetadataSuggestion {
  provider: 'GOOGLE_BOOKS' | 'OPEN_LIBRARY';
  externalId: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  publicationYear: number | null;
  description: string | null;
  language: string | null;
  pageCount: number | null;
  coverUrl: string | null;
  isbn13: string | null;
  isbn10: string | null;
  confidence: number;
}

export interface IsbnLookupResponse {
  valid: boolean;
  isbn13: string | null;
  localMatches: LocalEditionMatch[];
  suggestions: MetadataSuggestion[];
  providerErrors: string[];
}

export interface ConfirmMetadataInput {
  provider: MetadataSuggestion['provider'];
  externalId: string;
  isbn: string;
  title: string;
  subtitle: string | null;
  editionStatement: string | null;
  authors: string[];
  publisher: string | null;
  publicationYear: number | null;
  description: string | null;
  language: string | null;
  pageCount: number | null;
  confidence: number;
}

export interface OcrLookupResponse {
  provider: string;
  confidence: number | null;
  extractedText: string;
  fields: { title: string | null; authors: string[]; publisher: string | null };
  local: SearchResponse | null;
  suggestions: MetadataSuggestion[];
  providerErrors: string[];
}

export interface ConfirmOcrMetadataInput {
  title: string;
  subtitle: string | null;
  editionStatement: string | null;
  isbn: string | null;
  authors: string[];
  publisher: string | null;
  publicationYear: number | null;
  description: string | null;
  language: string | null;
  pageCount: number | null;
  provider: string;
  confidence: number | null;
}

@Injectable({ providedIn: 'root' })
export class ScannerService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE_URL}/scanner`;

  lookupIsbn(isbn: string): Observable<IsbnLookupResponse> {
    return this.http.post<IsbnLookupResponse>(`${this.base}/isbn-lookup`, { isbn });
  }

  lookupCover(file: File): Observable<OcrLookupResponse> {
    const body = new FormData();
    body.append('cover', file);
    return this.http.post<OcrLookupResponse>(`${this.base}/cover-ocr`, body);
  }

  confirmMetadata(
    input: ConfirmMetadataInput,
  ): Observable<{ bookId: string; editionId: string; title: string }> {
    return this.http.post<{ bookId: string; editionId: string; title: string }>(
      `${this.base}/confirm-metadata`,
      input,
    );
  }

  confirmOcrMetadata(
    input: ConfirmOcrMetadataInput,
  ): Observable<{ bookId: string; editionId: string; title: string }> {
    return this.http.post<{ bookId: string; editionId: string; title: string }>(
      `${this.base}/confirm-ocr-metadata`,
      input,
    );
  }
}

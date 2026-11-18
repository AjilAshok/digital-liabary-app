import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL, Paginated } from '../../core/api/api';

export interface AuthorRow {
  id: string;
  name: string;
  authorNumber: string | null;
  titles: number;
  copies: number;
}

export interface AuthorBook {
  id: string;
  title: string;
  subtitle: string | null;
  role: string;
  editions: {
    id: string;
    isbn13: string | null;
    editionStatement: string | null;
    publicationYear: number | null;
    copies: { holdings: number; available: number };
  }[];
  copies: { holdings: number; available: number };
}

export interface AuthorDetails extends AuthorRow {
  description: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  books: AuthorBook[];
  createdAt: string;
  updatedAt: string;
}

export interface AuthorInput {
  name: string;
  authorNumber: string | null;
  description: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  confirmDuplicateName?: boolean;
}

export interface DuplicateAuthorMatch {
  id: string;
  name: string;
  authorNumber: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthorsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE_URL}/authors`;

  list(page: number, pageSize: number, search: string): Observable<Paginated<AuthorRow>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (search.trim()) params = params.set('search', search.trim());
    return this.http.get<Paginated<AuthorRow>>(this.base, { params });
  }

  get(id: string): Observable<AuthorDetails> {
    return this.http.get<AuthorDetails>(`${this.base}/${id}`);
  }

  create(input: AuthorInput): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(this.base, input);
  }

  update(id: string, input: AuthorInput): Observable<{ id: string }> {
    return this.http.put<{ id: string }>(`${this.base}/${id}`, input);
  }
}

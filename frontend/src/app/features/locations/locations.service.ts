import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL, Paginated } from '../../core/api/api';

export type LocationLevel = 'buildings' | 'floors' | 'rooms' | 'racks' | 'shelves';

export interface LocationShelf {
  id: string;
  code: string;
  name: string | null;
  capacity: number | null;
  copies: number;
}

export interface LocationRack {
  id: string;
  code: string;
  name: string | null;
  shelves: LocationShelf[];
}

export interface LocationRoom {
  id: string;
  code: string;
  name: string;
  racks: LocationRack[];
}

export interface LocationFloor {
  id: string;
  code: string;
  name: string;
  level: number | null;
  rooms: LocationRoom[];
}

export interface LocationBuilding {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  floors: LocationFloor[];
}

export interface ShelfReportRow {
  id: string;
  code: string;
  name: string;
  capacity: number | null;
  path: string;
  titles: number;
  copies: number;
  available: number;
  issued: number;
  reserved: number;
  oldStock: number;
  newStock: number;
}

export interface CopyMatch {
  id: string;
  accessionNumber: string;
  status: string;
  shelf: { id: string; path: string } | null;
  book: { id: string; title: string };
  edition: { id: string; editionStatement: string | null };
}

export interface LocationInput {
  parentId?: string;
  code?: string;
  name?: string;
  address?: string | null;
  level?: number | null;
  capacity?: number | null;
}

@Injectable({ providedIn: 'root' })
export class LocationsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE_URL}/locations`;

  tree(): Observable<{ data: LocationBuilding[] }> {
    return this.http.get<{ data: LocationBuilding[] }>(`${this.base}/tree`);
  }

  shelves(): Observable<{ data: { id: string; path: string; label: string }[] }> {
    return this.http.get<{ data: { id: string; path: string; label: string }[] }>(
      `${this.base}/shelves`,
    );
  }

  shelfReport(
    page: number,
    pageSize: number,
    search: string,
  ): Observable<Paginated<ShelfReportRow>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (search.trim()) params = params.set('search', search.trim());
    return this.http.get<Paginated<ShelfReportRow>>(`${this.base}/reports/shelves`, { params });
  }

  create(level: LocationLevel, input: LocationInput): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${this.base}/${level}`, input);
  }

  update(level: LocationLevel, id: string, input: LocationInput): Observable<{ id: string }> {
    return this.http.patch<{ id: string }>(`${this.base}/${level}/${id}`, input);
  }

  findCopies(search: string): Observable<{ data: CopyMatch[] }> {
    const params = new HttpParams().set('search', search).set('page', 1).set('pageSize', 10);
    return this.http.get<{ data: CopyMatch[] }>(`${API_BASE_URL}/copies`, { params });
  }

  moveCopy(
    id: string,
    shelfId: string | null,
    reason: string,
  ): Observable<{
    id: string;
    accessionNumber: string;
    fromShelfId: string | null;
    toShelfId: string | null;
  }> {
    return this.http.post<{
      id: string;
      accessionNumber: string;
      fromShelfId: string | null;
      toShelfId: string | null;
    }>(`${this.base}/copies/${id}/move`, { shelfId, reason });
  }
}

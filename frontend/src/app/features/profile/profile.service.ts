import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { API_BASE_URL, Paginated } from '../../core/api/api';
import { AuthUser, AuthUserResponse } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';

export interface ActivityItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  updateProfile(fullName: string): Observable<AuthUser> {
    return this.http.patch<AuthUserResponse>(`${API_BASE_URL}/auth/me`, { fullName }).pipe(
      map((res) => res.user),
      tap((user) => this.auth.setUser(user)),
    );
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${API_BASE_URL}/auth/change-password`, {
      currentPassword,
      newPassword,
    });
  }

  activity(page: number, pageSize: number): Observable<Paginated<ActivityItem>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<Paginated<ActivityItem>>(`${API_BASE_URL}/auth/me/activity`, { params });
  }
}

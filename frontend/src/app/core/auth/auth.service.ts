import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, firstValueFrom, map, tap } from 'rxjs';
import { API_BASE_URL } from '../api/api';
import { AuthUser, AuthUserResponse, LoginRequest } from './auth.models';

/**
 * Holds the signed-in user. The session itself is an HttpOnly cookie managed by the backend,
 * so no token is ever stored in JavaScript-accessible storage.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly currentUser = signal<AuthUser | null>(null);

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  private readonly permissionSet = computed(() => new Set(this.currentUser()?.permissions ?? []));

  /** Restores an existing cookie session on startup. Never throws. */
  async restoreSession(): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.get<AuthUserResponse>(`${API_BASE_URL}/auth/me`));
      this.currentUser.set(res.user);
    } catch {
      this.currentUser.set(null);
    }
  }

  login(credentials: LoginRequest): Observable<AuthUser> {
    return this.http.post<AuthUserResponse>(`${API_BASE_URL}/auth/login`, credentials).pipe(
      map((res) => res.user),
      tap((user) => this.currentUser.set(user)),
    );
  }

  logout(): Observable<void> {
    return this.http
      .post<void>(`${API_BASE_URL}/auth/logout`, {})
      .pipe(tap({ finalize: () => this.clearSession() }));
  }

  /** Signs out every device by revoking all issued sessions. */
  logoutEverywhere(): Observable<void> {
    return this.http
      .post<void>(`${API_BASE_URL}/auth/logout-all`, {})
      .pipe(tap({ finalize: () => this.clearSession() }));
  }

  clearSession(): void {
    this.currentUser.set(null);
  }

  /** Replaces the cached user after the server returned an updated profile. */
  setUser(user: AuthUser): void {
    this.currentUser.set(user);
  }

  hasRole(role: string): boolean {
    return this.currentUser()?.roles.includes(role) ?? false;
  }

  hasPermission(permission: string): boolean {
    return this.permissionSet().has(permission);
  }

  hasAllPermissions(permissions: readonly string[]): boolean {
    return permissions.every((p) => this.permissionSet().has(p));
  }
}

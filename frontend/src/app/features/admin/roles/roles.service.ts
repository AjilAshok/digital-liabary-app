import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../../core/api/api';

export interface RoleSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}

export interface PermissionInfo {
  code: string;
  description: string;
  group: string;
}

@Injectable({ providedIn: 'root' })
export class RolesService {
  private readonly http = inject(HttpClient);

  listRoles(): Observable<RoleSummary[]> {
    return this.http
      .get<{ data: RoleSummary[] }>(`${API_BASE_URL}/roles`)
      .pipe(map((res) => res.data));
  }

  listPermissions(): Observable<PermissionInfo[]> {
    return this.http
      .get<{ data: PermissionInfo[] }>(`${API_BASE_URL}/roles/permissions`)
      .pipe(map((res) => res.data));
  }
}

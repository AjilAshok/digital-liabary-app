import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PageHeader } from '../../../shared/ui/page-header';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { forkJoin } from 'rxjs';
import { toApiError } from '../../../core/api/api';
import { PermissionInfo, RoleSummary, RolesService } from './roles.service';

type LoadState = 'loading' | 'loaded' | 'error';

interface RoleView extends RoleSummary {
  groups: { group: string; permissions: PermissionInfo[] }[];
}

@Component({
  selector: 'app-roles-page',
  imports: [PageHeader, MatExpansionModule, MatIconModule, MatButtonModule, MatProgressBarModule],
  templateUrl: './roles-page.html',
  styleUrl: './roles-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RolesPage {
  private readonly rolesService = inject(RolesService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly errorMessage = signal('');
  private readonly roles = signal<RoleSummary[]>([]);
  private readonly permissions = signal<PermissionInfo[]>([]);
  protected readonly totalPermissions = computed(() => this.permissions().length);

  protected readonly roleViews = computed<RoleView[]>(() => {
    const byCode = new Map(this.permissions().map((p) => [p.code, p]));
    return this.roles().map((role) => {
      const groups = new Map<string, PermissionInfo[]>();
      for (const code of role.permissions) {
        const info = byCode.get(code) ?? { code, description: code, group: code.split('.')[0] };
        groups.set(info.group, [...(groups.get(info.group) ?? []), info]);
      }
      return {
        ...role,
        groups: [...groups.entries()].map(([group, permissions]) => ({
          group: group.replace(/_/g, ' '),
          permissions,
        })),
      };
    });
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    forkJoin({
      roles: this.rolesService.listRoles(),
      permissions: this.rolesService.listPermissions(),
    }).subscribe({
      next: ({ roles, permissions }) => {
        this.roles.set(roles);
        this.permissions.set(permissions);
        this.state.set('loaded');
      },
      error: (err: unknown) => {
        this.errorMessage.set(toApiError(err).message);
        this.state.set('error');
      },
    });
  }
}

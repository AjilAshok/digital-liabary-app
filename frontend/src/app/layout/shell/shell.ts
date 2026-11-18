import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { Permissions } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ConfirmService } from '../../shared/ui/confirm-dialog';
import { Breadcrumbs } from '../breadcrumbs/breadcrumbs';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  permissions: string[];
}

interface NavSection {
  heading?: string;
  items: NavItem[];
}

/**
 * Navigation lists only modules that are implemented. Later phases add their entries here
 * (catalogue, copies, scanning, imports, purchases, members, circulation, audits, reports...).
 */
const NAVIGATION: NavSection[] = [
  {
    items: [
      {
        label: 'Home',
        icon: 'dashboard',
        route: '/dashboard',
        permissions: [],
      },
      {
        label: 'Books',
        icon: 'menu_book',
        route: '/catalogue/books',
        permissions: [Permissions.CATALOGUE_READ],
      },
      {
        label: 'Upload Excel',
        icon: 'upload_file',
        route: '/imports',
        permissions: [Permissions.IMPORTS_READ, Permissions.IMPORTS_MANAGE],
      },
      {
        label: 'Search library',
        icon: 'manage_search',
        route: '/search',
        permissions: [Permissions.CATALOGUE_READ, Permissions.COPIES_READ],
      },
      {
        label: 'Scan a barcode',
        icon: 'document_scanner',
        route: '/scanner/isbn',
        permissions: [Permissions.SCANNER_USE],
      },
      {
        label: 'Read book cover',
        icon: 'menu_book',
        route: '/scanner/cover',
        permissions: [Permissions.SCANNER_USE],
      },
      {
        label: 'Book copies',
        icon: 'inventory_2',
        route: '/catalogue/copies',
        permissions: [Permissions.COPIES_READ],
      },
      {
        label: 'Authors',
        icon: 'groups',
        route: '/authors',
        permissions: [Permissions.CATALOGUE_READ],
      },
      {
        label: 'Shelves & locations',
        icon: 'account_tree',
        route: '/locations',
        permissions: [Permissions.LOCATIONS_READ],
      },
    ],
  },
  {
    heading: 'Administration',
    items: [
      {
        label: 'Book number settings',
        icon: 'tag',
        route: '/admin/book-numbering',
        permissions: [Permissions.SETTINGS_MANAGE],
      },
      {
        label: 'Roles & permissions',
        icon: 'admin_panel_settings',
        route: '/admin/roles',
        permissions: [Permissions.ROLES_READ],
      },
    ],
  },
];

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatDividerModule,
    MatTooltipModule,
    Breadcrumbs,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly confirm = inject(ConfirmService);
  private readonly sidenav = viewChild.required<MatSidenav>('sidenav');

  protected readonly user = this.auth.user;
  protected readonly canFindBooks = computed(() => {
    this.user();
    return this.auth.hasPermission(Permissions.CATALOGUE_READ);
  });
  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe([Breakpoints.XSmall, Breakpoints.Small])
      .pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  protected readonly initials = computed(() => {
    const name = this.user()?.fullName ?? '';
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join('') || '?'
    );
  });

  protected readonly navigation = computed(() => {
    // Re-evaluate whenever the user (and so their permissions) changes.
    this.user();
    return NAVIGATION.map((section) => ({
      ...section,
      items: section.items.filter((item) => this.auth.hasAllPermissions(item.permissions)),
    })).filter((section) => section.items.length > 0);
  });

  protected onNavigate(): void {
    if (this.isHandset()) void this.sidenav().close();
  }

  protected signOut(everywhere = false): void {
    if (everywhere) {
      this.confirm
        .confirm({
          title: 'Sign out on all devices?',
          message:
            'Every active session for your account, including this one, will be ended. You will need to sign in again everywhere.',
          confirmText: 'Sign out everywhere',
          destructive: true,
        })
        .subscribe((ok) => {
          if (ok) this.performSignOut(true);
        });
      return;
    }
    this.performSignOut(false);
  }

  private performSignOut(everywhere: boolean): void {
    const request = everywhere ? this.auth.logoutEverywhere() : this.auth.logout();
    request.subscribe({
      next: () => this.afterSignOut(everywhere),
      // The local session is cleared even if the server call fails.
      error: () => this.afterSignOut(everywhere),
    });
  }

  private afterSignOut(everywhere: boolean): void {
    void this.router.navigate(['/login']);
    this.snackBar.open(
      everywhere ? 'Signed out on all devices.' : 'You have been signed out.',
      'Dismiss',
      { duration: 4000 },
    );
  }
}

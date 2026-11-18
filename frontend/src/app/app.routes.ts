import { Routes } from '@angular/router';
import { authGuard, guestGuard, permissionGuard } from './core/auth/auth.guards';
import { Permissions } from './core/auth/auth.models';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Sign in · Digital Library',
    loadComponent: () => import('./features/auth/login/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard · Digital Library',
        data: { breadcrumb: 'Dashboard' },
        loadComponent: () =>
          import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'profile',
        title: 'My profile · Digital Library',
        data: { breadcrumb: 'My profile' },
        loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
      },
      {
        path: 'authors',
        data: { breadcrumb: 'Authors', breadcrumbLink: false },
        children: [
          {
            path: '',
            pathMatch: 'full',
            title: 'Authors · Digital Library',
            data: { breadcrumb: 'Directory', permissions: [Permissions.CATALOGUE_READ] },
            canActivate: [permissionGuard],
            loadComponent: () =>
              import('./features/authors/authors-page').then((m) => m.AuthorsPage),
          },
          {
            path: 'new',
            title: 'Add author · Digital Library',
            data: {
              breadcrumb: 'Add author',
              mode: 'create',
              permissions: [Permissions.CATALOGUE_READ, Permissions.CATALOGUE_WRITE],
            },
            canActivate: [permissionGuard],
            loadComponent: () =>
              import('./features/authors/author-form-page').then((m) => m.AuthorFormPage),
          },
          {
            path: ':authorId/edit',
            title: 'Edit author · Digital Library',
            data: {
              breadcrumb: 'Edit author',
              mode: 'edit',
              permissions: [Permissions.CATALOGUE_READ, Permissions.CATALOGUE_WRITE],
            },
            canActivate: [permissionGuard],
            loadComponent: () =>
              import('./features/authors/author-form-page').then((m) => m.AuthorFormPage),
          },
          {
            path: ':authorId',
            title: 'Author profile · Digital Library',
            data: { breadcrumb: 'Author profile', permissions: [Permissions.CATALOGUE_READ] },
            canActivate: [permissionGuard],
            loadComponent: () =>
              import('./features/authors/author-details-page').then((m) => m.AuthorDetailsPage),
          },
        ],
      },
      {
        path: 'search',
        title: 'Advanced search · Digital Library',
        data: {
          breadcrumb: 'Advanced search',
          permissions: [Permissions.CATALOGUE_READ, Permissions.COPIES_READ],
        },
        canActivate: [permissionGuard],
        loadComponent: () => import('./features/search/search-page').then((m) => m.SearchPage),
      },
      {
        path: 'imports',
        title: 'Upload books · Digital Library',
        data: {
          breadcrumb: 'Upload books',
          permissions: [Permissions.IMPORTS_READ, Permissions.IMPORTS_MANAGE],
        },
        canActivate: [permissionGuard],
        loadComponent: () => import('./features/imports/import-page').then((m) => m.ImportPage),
      },
      {
        path: 'scanner/cover',
        title: 'Read book cover · Digital Library',
        data: { breadcrumb: 'Read book cover', permissions: [Permissions.SCANNER_USE] },
        canActivate: [permissionGuard],
        loadComponent: () =>
          import('./features/scanner/cover-ocr-page').then((m) => m.CoverOcrPage),
      },
      {
        path: 'scanner/isbn',
        title: 'Scan ISBN · Digital Library',
        data: { breadcrumb: 'Scan ISBN', permissions: [Permissions.SCANNER_USE] },
        canActivate: [permissionGuard],
        loadComponent: () =>
          import('./features/scanner/isbn-scanner-page').then((m) => m.IsbnScannerPage),
      },
      {
        path: 'locations',
        data: { breadcrumb: 'Locations', breadcrumbLink: false },
        children: [
          {
            path: '',
            pathMatch: 'full',
            title: 'Locations · Digital Library',
            data: { breadcrumb: 'Hierarchy', permissions: [Permissions.LOCATIONS_READ] },
            canActivate: [permissionGuard],
            loadComponent: () =>
              import('./features/locations/locations-page').then((m) => m.LocationsPage),
          },
          {
            path: 'new',
            title: 'Add location · Digital Library',
            data: {
              breadcrumb: 'Add location',
              permissions: [Permissions.LOCATIONS_READ, Permissions.LOCATIONS_MANAGE],
            },
            canActivate: [permissionGuard],
            loadComponent: () =>
              import('./features/locations/location-form-page').then((m) => m.LocationFormPage),
          },
          {
            path: ':level/:locationId/edit',
            title: 'Edit location · Digital Library',
            data: {
              breadcrumb: 'Edit location',
              permissions: [Permissions.LOCATIONS_READ, Permissions.LOCATIONS_MANAGE],
            },
            canActivate: [permissionGuard],
            loadComponent: () =>
              import('./features/locations/location-form-page').then((m) => m.LocationFormPage),
          },
          {
            path: 'move',
            title: 'Move a copy · Digital Library',
            data: {
              breadcrumb: 'Move a copy',
              permissions: [Permissions.LOCATIONS_MANAGE, Permissions.COPIES_READ],
            },
            canActivate: [permissionGuard],
            loadComponent: () =>
              import('./features/locations/move-copy-page').then((m) => m.MoveCopyPage),
          },
        ],
      },
      {
        path: 'catalogue',
        data: { breadcrumb: 'Catalogue', breadcrumbLink: false },
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'books' },
          {
            path: 'books',
            title: 'Book catalogue · Digital Library',
            data: { breadcrumb: 'Books', permissions: [Permissions.CATALOGUE_READ] },
            canActivate: [permissionGuard],
            loadComponent: () => import('./features/catalogue/books-page').then((m) => m.BooksPage),
          },
          {
            path: 'books/new',
            title: 'Add book · Digital Library',
            data: {
              breadcrumb: 'Add book',
              mode: 'create',
              permissions: [Permissions.CATALOGUE_READ, Permissions.CATALOGUE_WRITE],
            },
            canActivate: [permissionGuard],
            loadComponent: () =>
              import('./features/catalogue/book-form-page').then((m) => m.BookFormPage),
          },
          {
            path: 'books/:bookId/edit',
            title: 'Edit book · Digital Library',
            data: {
              breadcrumb: 'Edit book',
              mode: 'edit-book',
              permissions: [Permissions.CATALOGUE_READ, Permissions.CATALOGUE_WRITE],
            },
            canActivate: [permissionGuard],
            loadComponent: () =>
              import('./features/catalogue/book-form-page').then((m) => m.BookFormPage),
          },
          {
            path: 'books/:bookId/editions/new',
            title: 'Add edition · Digital Library',
            data: {
              breadcrumb: 'Add edition',
              mode: 'add-edition',
              permissions: [Permissions.CATALOGUE_READ, Permissions.CATALOGUE_WRITE],
            },
            canActivate: [permissionGuard],
            loadComponent: () =>
              import('./features/catalogue/book-form-page').then((m) => m.BookFormPage),
          },
          {
            path: 'editions/:editionId/edit',
            title: 'Edit edition · Digital Library',
            data: {
              breadcrumb: 'Edit edition',
              mode: 'edit-edition',
              permissions: [Permissions.CATALOGUE_READ, Permissions.CATALOGUE_WRITE],
            },
            canActivate: [permissionGuard],
            loadComponent: () =>
              import('./features/catalogue/book-form-page').then((m) => m.BookFormPage),
          },
          {
            path: 'books/:bookId',
            title: 'Book details · Digital Library',
            data: { breadcrumb: 'Book details', permissions: [Permissions.CATALOGUE_READ] },
            canActivate: [permissionGuard],
            loadComponent: () =>
              import('./features/catalogue/book-details-page').then((m) => m.BookDetailsPage),
          },
          {
            path: 'copies',
            title: 'Physical copies · Digital Library',
            data: { breadcrumb: 'Physical copies', permissions: [Permissions.COPIES_READ] },
            canActivate: [permissionGuard],
            loadComponent: () =>
              import('./features/catalogue/copies-page').then((m) => m.CopiesPage),
          },
          {
            path: 'editions/:editionId/copies/new',
            title: 'Register copies · Digital Library',
            data: {
              breadcrumb: 'Register copies',
              permissions: [Permissions.COPIES_WRITE, Permissions.CATALOGUE_READ],
            },
            canActivate: [permissionGuard],
            loadComponent: () =>
              import('./features/catalogue/copy-registration-page').then(
                (m) => m.CopyRegistrationPage,
              ),
          },
          {
            path: 'copies/:copyId',
            title: 'Physical copy · Digital Library',
            data: { breadcrumb: 'Physical copy', permissions: [Permissions.COPIES_READ] },
            canActivate: [permissionGuard],
            loadComponent: () =>
              import('./features/catalogue/copy-details-page').then((m) => m.CopyDetailsPage),
          },
        ],
      },
      {
        // Grouping route: contributes a breadcrumb but has no page of its own.
        path: 'admin',
        data: { breadcrumb: 'Administration', breadcrumbLink: false },
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'roles' },
          {
            path: 'book-numbering',
            title: 'Book number settings · Digital Library',
            canActivate: [permissionGuard],
            data: {
              breadcrumb: 'Book number settings',
              permissions: [Permissions.SETTINGS_MANAGE],
            },
            loadComponent: () =>
              import('./features/admin/accession-settings-page').then(
                (m) => m.AccessionSettingsPage,
              ),
          },
          {
            path: 'roles',
            title: 'Roles & permissions · Digital Library',
            canActivate: [permissionGuard],
            data: { breadcrumb: 'Roles & permissions', permissions: [Permissions.ROLES_READ] },
            loadComponent: () =>
              import('./features/admin/roles/roles-page').then((m) => m.RolesPage),
          },
        ],
      },
      {
        path: 'forbidden',
        title: 'Access denied · Digital Library',
        loadComponent: () =>
          import('./features/errors/forbidden-page').then((m) => m.ForbiddenPage),
      },
      {
        path: '**',
        title: 'Page not found · Digital Library',
        loadComponent: () => import('./features/errors/not-found-page').then((m) => m.NotFoundPage),
      },
    ],
  },
];

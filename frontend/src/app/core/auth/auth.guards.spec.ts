import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { authGuard, guestGuard, permissionGuard, safeReturnUrl } from './auth.guards';
import { AuthService } from './auth.service';

class FakeAuth {
  readonly signedIn = signal(false);
  permissions = new Set<string>();
  isAuthenticated = () => this.signedIn();
  hasAllPermissions = (required: readonly string[]) =>
    required.every((p) => this.permissions.has(p));
}

describe('route guards', () => {
  let auth: FakeAuth;
  let router: Router;

  beforeEach(() => {
    auth = new FakeAuth();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    router = TestBed.inject(Router);
  });

  const run = <T>(fn: () => T) => TestBed.runInInjectionContext(fn);
  const state = (url: string) => ({ url }) as RouterStateSnapshot;
  const routeWith = (permissions: string[]) =>
    ({ data: { permissions } }) as unknown as ActivatedRouteSnapshot;

  it('authGuard redirects anonymous users to /login with returnUrl', () => {
    const result = run(() => authGuard({} as ActivatedRouteSnapshot, state('/admin/roles')));
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Fadmin%2Froles');
  });

  it('authGuard allows signed-in users', () => {
    auth.signedIn.set(true);
    expect(run(() => authGuard({} as ActivatedRouteSnapshot, state('/dashboard')))).toBe(true);
  });

  it('guestGuard sends signed-in users to the dashboard', () => {
    auth.signedIn.set(true);
    const result = run(() => guestGuard({} as ActivatedRouteSnapshot, state('/login')));
    expect(router.serializeUrl(result as UrlTree)).toBe('/dashboard');
  });

  it('permissionGuard blocks users lacking a permission', () => {
    auth.signedIn.set(true);
    const result = run(() => permissionGuard(routeWith(['roles.read']), state('/admin/roles')));
    expect(router.serializeUrl(result as UrlTree)).toBe('/forbidden');
  });

  it('permissionGuard allows users holding every permission', () => {
    auth.signedIn.set(true);
    auth.permissions = new Set(['roles.read']);
    expect(run(() => permissionGuard(routeWith(['roles.read']), state('/admin/roles')))).toBe(true);
  });
});

describe('safeReturnUrl', () => {
  it.each([
    [undefined, '/dashboard'],
    ['', '/dashboard'],
    ['https://evil.example', '/dashboard'],
    ['//evil.example', '/dashboard'],
    ['/\\evil.example', '/dashboard'],
    ['/login?returnUrl=/x', '/dashboard'],
    ['/admin/roles', '/admin/roles'],
  ])('%s → %s', (input, expected) => {
    expect(safeReturnUrl(input)).toBe(expected);
  });
});

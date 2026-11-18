import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Requires a signed-in user; otherwise redirects to /login with a return URL. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.isAuthenticated()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Keeps signed-in users away from the login page. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? inject(Router).createUrlTree(['/dashboard']) : true;
};

/**
 * Requires every permission listed in `route.data.permissions`.
 * UI convenience only — the backend independently enforces the same permissions.
 */
export const permissionGuard: CanActivateFn = (route) => {
  const required = (route.data['permissions'] as string[] | undefined) ?? [];
  return inject(AuthService).hasAllPermissions(required)
    ? true
    : inject(Router).createUrlTree(['/forbidden']);
};

/** Only allows same-app relative return URLs (prevents open redirects). */
export function safeReturnUrl(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/dashboard';
  }
  if (value.startsWith('/login')) return '/dashboard';
  return value;
}

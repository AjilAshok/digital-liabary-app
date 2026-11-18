import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API_BASE_URL } from '../api/api';
import { AuthService } from './auth.service';

const SESSION_ENDPOINTS = [`${API_BASE_URL}/auth/login`, `${API_BASE_URL}/auth/me`];

/** When the session expires or is revoked mid-use, clear local state and return to the login page. */
export const sessionExpiryInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !SESSION_ENDPOINTS.some((url) => req.url.startsWith(url)) &&
        auth.isAuthenticated()
      ) {
        auth.clearSession();
        void router.navigate(['/login'], {
          queryParams: { returnUrl: router.url, reason: 'expired' },
        });
      }
      return throwError(() => error);
    }),
  );
};

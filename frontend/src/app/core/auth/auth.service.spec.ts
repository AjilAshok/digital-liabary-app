import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthUser } from './auth.models';
import { AuthService } from './auth.service';

const USER: AuthUser = {
  id: 'u1',
  email: 'librarian@test.local',
  fullName: 'Lib Rarian',
  roles: ['LIBRARIAN'],
  permissions: ['catalogue.read', 'catalogue.write'],
  lastLoginAt: null,
};

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts signed out', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.hasPermission('catalogue.read')).toBe(false);
  });

  it('logs in via the API and exposes permissions', () => {
    let result: AuthUser | undefined;
    service.login({ email: USER.email, password: 'pw' }).subscribe((u) => (result = u));

    const req = http.expectOne('/api/v1/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: USER.email, password: 'pw' });
    req.flush({ user: USER });

    expect(result).toEqual(USER);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.hasPermission('catalogue.write')).toBe(true);
    expect(service.hasAllPermissions(['catalogue.read', 'users.manage'])).toBe(false);
  });

  it('restores an existing session from /auth/me', async () => {
    const restoring = service.restoreSession();
    http.expectOne('/api/v1/auth/me').flush({ user: USER });
    await restoring;
    expect(service.user()).toEqual(USER);
  });

  it('treats a 401 from /auth/me as signed out without throwing', async () => {
    const restoring = service.restoreSession();
    http
      .expectOne('/api/v1/auth/me')
      .flush(
        { error: { code: 'UNAUTHENTICATED', message: 'x' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await expect(restoring).resolves.toBeUndefined();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('clears the local session on logout even if the server call fails', () => {
    service.login({ email: USER.email, password: 'pw' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush({ user: USER });

    service.logout().subscribe({ error: () => undefined });
    http.expectOne('/api/v1/auth/logout').flush(null, { status: 500, statusText: 'Error' });
    expect(service.isAuthenticated()).toBe(false);
  });
});

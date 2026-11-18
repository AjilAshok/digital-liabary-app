import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthUser } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ProfilePage } from './profile-page';

const USER: AuthUser = {
  id: 'u1',
  email: 'librarian@test.local',
  fullName: 'Test Librarian',
  roles: ['LIBRARIAN'],
  permissions: [],
  lastLoginAt: null,
};

const ACTIVITY = {
  data: [
    {
      id: 'a1',
      action: 'auth.login',
      entityType: 'User',
      entityId: 'u1',
      ipAddress: '127.0.0.1',
      createdAt: '2026-11-16T05:00:00.000Z',
    },
  ],
  meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
};

describe('ProfilePage', () => {
  let fixture: ComponentFixture<ProfilePage>;
  let http: HttpTestingController;
  let el: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ProfilePage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(AuthService).setUser(USER);
    fixture = TestBed.createComponent(ProfilePage);
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
    http.expectOne('/api/v1/auth/me/activity?page=1&pageSize=10').flush(ACTIVITY);
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  function type(selector: string, value: string, index = 0) {
    const input = el.querySelectorAll<HTMLInputElement>(selector)[index]!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('shows the user and their activity from the API', () => {
    expect(el.textContent).toContain('librarian@test.local');
    expect(el.querySelector<HTMLInputElement>('input[autocomplete="name"]')!.value).toBe(
      'Test Librarian',
    );
    expect(el.textContent).toContain('Signed in');
    expect(el.textContent).toContain('127.0.0.1');
  });

  it('saves the name and updates the signed-in user', async () => {
    type('input[autocomplete="name"]', 'Renamed Librarian');
    el.querySelectorAll('form')[0]!.dispatchEvent(new Event('submit'));

    const req = http.expectOne('/api/v1/auth/me');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ fullName: 'Renamed Librarian' });
    req.flush({ user: { ...USER, fullName: 'Renamed Librarian' } });
    http.expectOne((r) => r.url === '/api/v1/auth/me/activity').flush(ACTIVITY);

    expect(TestBed.inject(AuthService).user()?.fullName).toBe('Renamed Librarian');
  });

  it('blocks submission when the new passwords do not match', async () => {
    type('input[autocomplete="current-password"]', 'Old-Pass-2026');
    type('input[autocomplete="new-password"]', 'Brand-New-Pass-2026', 0);
    type('input[autocomplete="new-password"]', 'Different-Pass-2026', 1);
    el.querySelectorAll('form')[1]!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    http.expectNone('/api/v1/auth/change-password');
    expect(el.textContent).toContain('Confirm new password does not match');
  });

  it('shows the server field error when the current password is wrong', async () => {
    type('input[autocomplete="current-password"]', 'Wrong-Pass-2026');
    type('input[autocomplete="new-password"]', 'Brand-New-Pass-2026', 0);
    type('input[autocomplete="new-password"]', 'Brand-New-Pass-2026', 1);
    el.querySelectorAll('form')[1]!.dispatchEvent(new Event('submit'));

    http.expectOne('/api/v1/auth/change-password').flush(
      {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          details: [{ path: 'currentPassword', message: 'Current password is incorrect' }],
        },
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await fixture.whenStable();
    expect(el.textContent).toContain('Current password is incorrect');
    expect(el.querySelector('.form-error')).toBeNull();
  });
});

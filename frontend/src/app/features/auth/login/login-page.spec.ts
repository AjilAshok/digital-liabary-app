import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let http: HttpTestingController;
  let router: Router;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPage);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  function fill(email: string, password: string) {
    const emailInput = el.querySelector<HTMLInputElement>('input[type="email"]')!;
    const passwordInput = el.querySelector<HTMLInputElement>(
      'input[autocomplete="current-password"]',
    )!;
    emailInput.value = email;
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = password;
    passwordInput.dispatchEvent(new Event('input'));
  }

  function submit() {
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  it('shows validation errors and sends no request when the form is empty', async () => {
    submit();
    await fixture.whenStable();
    expect(el.textContent).toContain('Email is required');
    expect(el.textContent).toContain('Password is required');
    http.expectNone('/api/v1/auth/login');
  });

  it('signs in and navigates to a safe return URL', async () => {
    fixture.componentRef.setInput('returnUrl', '/admin/roles');
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fill('admin@test.local', 'Secret-Pass-1');
    submit();

    const req = http.expectOne('/api/v1/auth/login');
    expect(req.request.body).toEqual({ email: 'admin@test.local', password: 'Secret-Pass-1' });
    req.flush({
      user: {
        id: '1',
        email: 'admin@test.local',
        fullName: 'Admin',
        roles: ['ADMIN'],
        permissions: [],
        lastLoginAt: null,
      },
    });

    expect(navigate).toHaveBeenCalledWith('/admin/roles');
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(true);
  });

  it('ignores an external return URL', async () => {
    fixture.componentRef.setInput('returnUrl', 'https://evil.example');
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fill('admin@test.local', 'Secret-Pass-1');
    submit();
    http.expectOne('/api/v1/auth/login').flush({
      user: { id: '1', email: 'a', fullName: 'A', roles: [], permissions: [], lastLoginAt: null },
    });
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('shows the server error message on failed sign-in and clears the password', async () => {
    fill('admin@test.local', 'wrong-password');
    submit();
    http
      .expectOne('/api/v1/auth/login')
      .flush(
        { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await fixture.whenStable();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Invalid email or password');
    expect(
      el.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')!.value,
    ).toBe('');
  });

  it('explains when the server cannot be reached', async () => {
    fill('admin@test.local', 'Secret-Pass-1');
    submit();
    http.expectOne('/api/v1/auth/login').error(new ProgressEvent('error'), { status: 0 });
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Cannot reach the server');
  });
});

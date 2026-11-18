import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RolesPage } from './roles-page';

describe('RolesPage', () => {
  let fixture: ComponentFixture<RolesPage>;
  let http: HttpTestingController;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RolesPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(RolesPage);
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function respond(roles: unknown[]) {
    http.expectOne('/api/v1/roles').flush({ data: roles });
    http.expectOne('/api/v1/roles/permissions').flush({
      data: [
        { code: 'roles.read', description: 'View roles', group: 'roles' },
        { code: 'catalogue.read', description: 'Search catalogue', group: 'catalogue' },
      ],
    });
  }

  it('shows a loading indicator first', () => {
    expect(el.querySelector('mat-progress-bar')).not.toBeNull();
    respond([]);
  });

  it('renders roles returned by the API', async () => {
    respond([
      {
        id: 'r1',
        code: 'ADMIN',
        name: 'Administrator',
        description: 'All access',
        isSystem: true,
        userCount: 1,
        permissions: ['catalogue.read', 'roles.read'],
      },
    ]);
    await fixture.whenStable();
    expect(el.textContent).toContain('Administrator');
    expect(el.textContent).toContain('2 of 2 permissions');
    expect(el.textContent).toContain('1 user');
  });

  it('shows an empty state when no roles exist', async () => {
    respond([]);
    await fixture.whenStable();
    expect(el.textContent).toContain('No roles are defined yet');
  });

  it('shows an error with retry when loading fails', async () => {
    http.expectOne('/api/v1/roles').flush(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action',
        },
      },
      { status: 403, statusText: 'Forbidden' },
    );
    // forkJoin cancels the sibling request once one fails.
    expect(http.expectOne('/api/v1/roles/permissions').cancelled).toBe(true);
    await fixture.whenStable();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('do not have permission');
    el.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    fixture.detectChanges();
    respond([]);
  });
});

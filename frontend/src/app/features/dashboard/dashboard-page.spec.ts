import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthUser } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardPage } from './dashboard-page';
import { DashboardActivities, DashboardCharts, DashboardSummary } from './dashboard.service';

const ADMIN: AuthUser = {
  id: 'u1',
  email: 'admin@test.local',
  fullName: 'Ada Admin',
  roles: ['ADMIN'],
  permissions: ['dashboard.read', 'settings.manage', 'roles.read'],
  lastLoginAt: null,
};

const SUMMARY: DashboardSummary = {
  generatedAt: '2026-11-16T06:00:00.000Z',
  currency: null,
  titles: { works: 3, editions: 4 },
  copies: {
    holdings: 8,
    discarded: 1,
    available: 2,
    issued: 2,
    damaged: 1,
    missing: 1,
    oldStock: 3,
    newStock: 3,
    byStatus: {},
    byAcquisition: {},
  },
  members: { total: 3, active: 2 },
  loans: { active: 2, overdue: 1 },
  inventoryValue: { amount: '78.25', pricedCopies: 5, unpricedCopies: 3 },
  digitization: {
    registerTotal: null,
    legacyDigitized: 4,
    percent: null,
    exceedsRegisterBy: 0,
    remaining: null,
    pendingVerification: 1,
  },
};

const CHARTS: DashboardCharts = {
  timeZone: 'UTC',
  availability: { available: 2, issued: 2, reserved: 1, notLendable: 3 },
  stockSource: { oldStock: 3, newStock: 3, donated: 1, other: 1 },
  categories: [{ categoryId: 'c1', name: 'History', copies: 3, titles: 1 }],
  monthlyPurchases: [{ month: '2026-11', purchases: 1, amount: '51.00', copiesReceived: 2 }],
  monthlyCirculation: [
    { month: '2026-10', issued: 3, returned: 1 },
    { month: '2026-11', issued: 1, returned: 1 },
  ],
};

const ACTIVITIES: DashboardActivities = {
  activity: [
    {
      id: 'a1',
      action: 'settings.updated',
      entityType: 'Setting',
      entityId: null,
      actor: 'Ada Admin',
      createdAt: '2026-11-16T05:00:00.000Z',
    },
  ],
  recentAdditions: [
    {
      id: 'c9',
      accessionNumber: 'D-9',
      title: 'Physics Basics',
      acquisitionType: 'PURCHASED_NEW',
      status: 'RESERVED',
      createdAt: '2026-11-16T05:00:00.000Z',
    },
  ],
  dueLoans: [
    {
      id: 'l1',
      accessionNumber: 'D-2',
      title: 'Physics Basics',
      member: { fullName: 'Member M1', membershipNumber: 'M1' },
      issuedAt: '2026-10-15T12:00:00.000Z',
      dueAt: '2026-10-25T12:00:00.000Z',
      overdue: true,
      daysOverdue: 22,
    },
  ],
};

describe('DashboardPage', () => {
  let fixture: ComponentFixture<DashboardPage>;
  let http: HttpTestingController;
  let el: HTMLElement;

  async function setup(user: AuthUser = ADMIN) {
    TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(AuthService).setUser(user);
    fixture = TestBed.createComponent(DashboardPage);
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  function respondAll() {
    http.expectOne('/api/v1/dashboard/summary').flush(SUMMARY);
    http.expectOne('/api/v1/dashboard/charts?months=12').flush(CHARTS);
    http.expectOne('/api/v1/dashboard/recent-activities').flush(ACTIVITIES);
  }

  afterEach(() => http.verify());

  const tile = (label: string) =>
    [...el.querySelectorAll('app-stat-tile')].find((t) =>
      t.querySelector('.tile__label')?.textContent?.includes(label),
    );

  it('renders every key figure from the API', async () => {
    await setup();
    respondAll();
    await fixture.whenStable();

    const value = (label: string) =>
      tile(label)?.querySelector('.tile__value')?.textContent?.trim();
    expect(value('Book titles')).toBe('3');
    expect(value('Physical copies')).toBe('8');
    expect(value('Available')).toBe('2');
    expect(value('Issued')).toBe('2');
    expect(value('Old stock')).toBe('3');
    expect(value('New stock')).toBe('3');
    expect(value('Damaged')).toBe('1');
    expect(value('Missing')).toBe('1');
    expect(value('Members')).toBe('3');
    expect(value('Overdue books')).toBe('1');
    expect(value('Inventory value')).toBe('78.25');
    expect(value('Digitization progress')).toBe('4');
    expect(tile('Inventory value')?.textContent).toContain('3 copies without a recorded price');
    expect(tile('Available')?.textContent).toContain('25%');
  });

  it('flags overdue loans with an icon and text, not colour alone', async () => {
    await setup();
    respondAll();
    await fixture.whenStable();
    const overdue = tile('Overdue books')!;
    expect(overdue.querySelector('.tile--critical')).not.toBeNull();
    expect(overdue.querySelector('.tile__status')?.textContent).toContain('1 of 2 loans overdue');
  });

  it('renders all five charts and the activity lists', async () => {
    await setup();
    respondAll();
    await fixture.whenStable();
    expect(el.querySelectorAll('app-segmented-bar')).toHaveLength(2);
    expect(el.querySelector('app-bar-list')?.textContent).toContain('History');
    expect(el.querySelector('app-column-chart')).not.toBeNull();
    expect(el.querySelector('app-line-chart')).not.toBeNull();
    expect(el.textContent).toContain('22 days overdue');
    expect(el.textContent).toContain('Member M1 (M1)');
    expect(el.textContent).toContain('Ada Admin updated a library setting');
  });

  it('offers the digitization target only to users who can manage settings', async () => {
    await setup();
    respondAll();
    await fixture.whenStable();
    expect(el.textContent).toContain('Set register total');
    expect(el.textContent).toContain('Set digitization target');
  });

  it('hides admin quick actions from an assistant', async () => {
    await setup({ ...ADMIN, roles: ['ASSISTANT'], permissions: ['dashboard.read'] });
    respondAll();
    await fixture.whenStable();
    expect(el.textContent).not.toContain('Set register total');
    expect(el.textContent).not.toContain('Roles & permissions');
    expect(el.textContent).toContain('Refresh figures');
    expect(el.textContent).not.toContain('Add a book');
    expect(el.textContent).not.toContain('Scan a barcode');
  });

  it('shows everyday shortcuts only when their required permissions are present', async () => {
    await setup({
      ...ADMIN,
      permissions: [
        'dashboard.read',
        'catalogue.read',
        'catalogue.write',
        'copies.read',
        'scanner.use',
        'imports.read',
        'imports.manage',
      ],
    });
    respondAll();
    await fixture.whenStable();

    const actions = el.querySelector('[aria-labelledby="quick-actions-title"]')!;
    expect(actions.textContent).toContain('Search books');
    expect(actions.textContent).toContain('Add a book');
    expect(actions.textContent).toContain('Upload Excel');
    expect(actions.textContent).toContain('Scan a barcode');
    expect(actions.textContent).toContain('Read a book cover');
    expect(actions.querySelector('a[href="/catalogue/books/new"]')).not.toBeNull();
  });

  it('shows a per-section error with retry while other sections still render', async () => {
    await setup();
    http
      .expectOne('/api/v1/dashboard/summary')
      .flush(
        { error: { code: 'INTERNAL_ERROR', message: 'Database unavailable' } },
        { status: 503, statusText: 'x' },
      );
    http.expectOne('/api/v1/dashboard/charts?months=12').flush(CHARTS);
    http.expectOne('/api/v1/dashboard/recent-activities').flush(ACTIVITIES);
    await fixture.whenStable();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Could not load key figures');
    expect(el.querySelector('app-line-chart')).not.toBeNull();

    el.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    respondAll();
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});

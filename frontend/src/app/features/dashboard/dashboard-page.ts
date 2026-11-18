import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  WritableSignal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { toApiError } from '../../core/api/api';
import { Permissions } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { BarList, BarListItem } from '../../shared/charts/bar-list';
import { ColumnChart, ColumnDatum } from '../../shared/charts/column-chart';
import { formatCount, formatMoney, formatPercent } from '../../shared/charts/format';
import { LineChart, LineSeries } from '../../shared/charts/line-chart';
import { Meter } from '../../shared/charts/meter';
import { Segment, SegmentedBar } from '../../shared/charts/segmented-bar';
import { StatTile } from '../../shared/charts/stat-tile';
import { PageHeader } from '../../shared/ui/page-header';
import {
  DashboardActivities,
  DashboardCharts,
  DashboardService,
  DashboardSummary,
} from './dashboard.service';
import { RegisterTotalDialog } from './register-total-dialog';

interface Section<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

const initial = <T>(): Section<T> => ({ data: null, loading: true, error: null });

const ACTIVITY_LABELS: Record<string, string> = {
  'auth.login': 'signed in',
  'auth.logout': 'signed out',
  'auth.logout_all': 'signed out on all devices',
  'auth.login_failed': 'failed sign-in attempt',
  'auth.account_locked': 'account locked after failed sign-ins',
  'auth.login_blocked': 'sign-in blocked (locked account)',
  'user.profile_updated': 'updated their profile',
  'user.password_changed': 'changed their password',
  'user.password_change_failed': 'password change rejected',
  'settings.updated': 'updated a library setting',
  'demo.seed': 'loaded demo data',
};

const ACQUISITION_LABELS: Record<string, string> = {
  LEGACY_OLD_STOCK: 'Old stock',
  PURCHASED_NEW: 'Purchased',
  DONATED: 'Donated',
  TRANSFERRED: 'Transferred',
  OTHER: 'Other',
};

export interface QuickAction {
  label: string;
  icon: string;
  /** Router link, or null for an in-page action. */
  route: string | null;
  action?: 'registerTotal' | 'refresh';
  permissions: string[];
}

/**
 * Only actions whose module exists are listed. Later phases add entries here
 * (scan ISBN, add book, issue/return, import old stock, new purchase...).
 */
const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Search books',
    icon: 'search',
    route: '/search',
    permissions: [Permissions.CATALOGUE_READ, Permissions.COPIES_READ],
  },
  {
    label: 'Add a book',
    icon: 'add',
    route: '/catalogue/books/new',
    permissions: [Permissions.CATALOGUE_READ, Permissions.CATALOGUE_WRITE],
  },
  {
    label: 'Upload Excel',
    icon: 'upload_file',
    route: '/imports',
    permissions: [Permissions.IMPORTS_READ, Permissions.IMPORTS_MANAGE],
  },
  {
    label: 'Scan a barcode',
    icon: 'document_scanner',
    route: '/scanner/isbn',
    permissions: [Permissions.SCANNER_USE],
  },
  {
    label: 'Read a book cover',
    icon: 'image_search',
    route: '/scanner/cover',
    permissions: [Permissions.SCANNER_USE],
  },
  { label: 'Refresh figures', icon: 'refresh', route: null, action: 'refresh', permissions: [] },
  {
    label: 'Set digitization target',
    icon: 'flag',
    route: null,
    action: 'registerTotal',
    permissions: [Permissions.SETTINGS_MANAGE],
  },
  {
    label: 'Roles & permissions',
    icon: 'admin_panel_settings',
    route: '/admin/roles',
    permissions: [Permissions.ROLES_READ],
  },
  { label: 'My profile', icon: 'account_circle', route: '/profile', permissions: [] },
];

@Component({
  selector: 'app-dashboard-page',
  imports: [
    DatePipe,
    RouterLink,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
    PageHeader,
    StatTile,
    Meter,
    SegmentedBar,
    BarList,
    ColumnChart,
    LineChart,
  ],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  private readonly service = inject(DashboardService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);

  protected readonly summary = signal<Section<DashboardSummary>>(initial());
  protected readonly charts = signal<Section<DashboardCharts>>(initial());
  protected readonly activities = signal<Section<DashboardActivities>>(initial());

  protected readonly firstName = computed(() => this.auth.user()?.fullName.split(/\s+/)[0] ?? '');
  protected readonly canSetTarget = computed(() => {
    this.auth.user();
    return this.auth.hasPermission(Permissions.SETTINGS_MANAGE);
  });

  // ── KPI tiles ────────────────────────────────────────────────────────────
  protected readonly tiles = computed(() => {
    const s = this.summary().data;
    if (!s) return [];
    const c = s.copies;
    const share = (n: number) =>
      c.holdings > 0 ? ` · ${formatPercent((n / c.holdings) * 100)}` : '';
    return [
      {
        label: 'Book titles',
        icon: 'menu_book',
        value: formatCount(s.titles.works),
        context: `${formatCount(s.titles.editions)} editions`,
      },
      {
        label: 'Physical copies',
        icon: 'inventory_2',
        value: formatCount(c.holdings),
        context: c.discarded
          ? `${formatCount(c.discarded)} discarded, not counted`
          : 'In the collection',
      },
      {
        label: 'Available',
        icon: 'check_circle',
        value: formatCount(c.available),
        context: `Ready to lend${share(c.available)}`,
      },
      {
        label: 'Issued',
        icon: 'outbox',
        value: formatCount(c.issued),
        context: `On loan${share(c.issued)}`,
      },
      {
        label: 'Old stock',
        icon: 'history_edu',
        value: formatCount(c.oldStock),
        context: 'Legacy register copies',
      },
      {
        label: 'New stock',
        icon: 'new_releases',
        value: formatCount(c.newStock),
        context: 'Purchased copies',
      },
      {
        label: 'Damaged',
        icon: 'broken_image',
        value: formatCount(c.damaged),
        context: 'Awaiting repair decision',
      },
      {
        label: 'Missing',
        icon: 'help_center',
        value: formatCount(c.missing),
        context: 'Not found on shelf',
      },
      {
        label: 'Members',
        icon: 'groups',
        value: formatCount(s.members.total),
        context: `${formatCount(s.members.active)} active`,
      },
      {
        label: 'Overdue books',
        icon: 'schedule',
        value: formatCount(s.loans.overdue),
        context: `of ${formatCount(s.loans.active)} active loans`,
        critical: s.loans.overdue > 0,
        statusText: `${formatCount(s.loans.overdue)} of ${formatCount(s.loans.active)} loans overdue`,
      },
      {
        label: 'Inventory value',
        icon: 'payments',
        value: formatMoney(s.inventoryValue.amount, s.currency),
        context:
          s.inventoryValue.unpricedCopies > 0
            ? `${formatCount(s.inventoryValue.unpricedCopies)} copies without a recorded price`
            : 'All copies priced',
      },
    ];
  });

  protected readonly digitization = computed(() => this.summary().data?.digitization ?? null);
  protected readonly mainTiles = computed(() =>
    this.tiles().filter((tile) =>
      ['Physical copies', 'Available', 'Old stock', 'New stock'].includes(tile.label),
    ),
  );
  protected readonly otherTiles = computed(() =>
    this.tiles().filter(
      (tile) => !['Physical copies', 'Available', 'Old stock', 'New stock'].includes(tile.label),
    ),
  );

  // ── Charts ───────────────────────────────────────────────────────────────
  protected readonly availabilitySegments = computed<Segment[]>(() => {
    const a = this.charts().data?.availability;
    if (!a) return [];
    return [
      { label: 'Available', value: a.available, slot: 1 },
      { label: 'Issued', value: a.issued, slot: 2 },
      { label: 'Reserved', value: a.reserved, slot: 3 },
      { label: 'Not lendable', value: a.notLendable, slot: 4 },
    ];
  });

  protected readonly stockSegments = computed<Segment[]>(() => {
    const s = this.charts().data?.stockSource;
    if (!s) return [];
    return [
      { label: 'Old stock', value: s.oldStock, slot: 1 },
      { label: 'New stock', value: s.newStock, slot: 2 },
      { label: 'Donated', value: s.donated, slot: 3 },
      { label: 'Transferred / other', value: s.other, slot: 4 },
    ];
  });

  protected readonly categoryItems = computed<BarListItem[]>(
    () =>
      this.charts().data?.categories.map((c) => ({
        label: c.name,
        value: c.copies,
        detail: `${formatCount(c.titles)} ${c.titles === 1 ? 'title' : 'titles'}`,
      })) ?? [],
  );

  protected readonly purchaseColumns = computed<ColumnDatum[]>(() => {
    const currency = this.summary().data?.currency ?? null;
    return (
      this.charts().data?.monthlyPurchases.map((m) => ({
        month: m.month,
        value: m.copiesReceived,
        details: [
          `${formatCount(m.purchases)} ${m.purchases === 1 ? 'invoice' : 'invoices'}`,
          formatMoney(m.amount, currency),
        ],
      })) ?? []
    );
  });

  protected readonly circulationMonths = computed(
    () => this.charts().data?.monthlyCirculation.map((m) => m.month) ?? [],
  );
  protected readonly circulationSeries = computed<LineSeries[]>(() => {
    const rows = this.charts().data?.monthlyCirculation ?? [];
    return [
      { label: 'Issued', slot: 1, values: rows.map((r) => r.issued) },
      { label: 'Returned', slot: 2, values: rows.map((r) => r.returned) },
    ];
  });

  protected readonly quickActions = computed(() => {
    this.auth.user();
    return QUICK_ACTIONS.filter((a) => this.auth.hasAllPermissions(a.permissions));
  });

  constructor() {
    this.load();
  }

  /** Loads each section independently; on refresh the previous render stays visible. */
  protected load(): void {
    this.fetch(this.summary, this.service.summary());
    this.fetch(this.charts, this.service.charts(12));
    this.fetch(this.activities, this.service.activities());
  }

  private fetch<T>(section: WritableSignal<Section<T>>, source: Observable<T>): void {
    section.update((s) => ({ ...s, loading: true, error: null }));
    source.subscribe({
      next: (data) => section.set({ data, loading: false, error: null }),
      error: (err: unknown) =>
        section.update((s) => ({ ...s, loading: false, error: toApiError(err).message })),
    });
  }

  protected runAction(action: QuickAction): void {
    if (action.action === 'refresh') this.load();
    if (action.action === 'registerTotal') this.openRegisterTotal();
  }

  protected openRegisterTotal(): void {
    this.dialog
      .open(RegisterTotalDialog, {
        data: { current: this.digitization()?.registerTotal ?? null },
        width: '440px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((progress) => {
        if (progress) {
          this.summary.update((s) =>
            s.data ? { ...s, data: { ...s.data, digitization: progress } } : s,
          );
        }
      });
  }

  protected activityText(action: string): string {
    return ACTIVITY_LABELS[action] ?? action.replace(/[._]/g, ' ');
  }

  protected acquisitionLabel(type: string): string {
    return ACQUISITION_LABELS[type] ?? type;
  }

  protected readonly formatCount = formatCount;
  protected readonly formatPercent = formatPercent;
}

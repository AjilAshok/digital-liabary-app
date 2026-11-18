import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../core/api/api';

export interface DigitizationProgress {
  registerTotal: number | null;
  legacyDigitized: number;
  percent: number | null;
  exceedsRegisterBy: number;
  remaining: number | null;
  pendingVerification: number;
}

export interface DashboardSummary {
  generatedAt: string;
  currency: string | null;
  titles: { works: number; editions: number };
  copies: {
    holdings: number;
    discarded: number;
    available: number;
    issued: number;
    damaged: number;
    missing: number;
    oldStock: number;
    newStock: number;
    byStatus: Record<string, number>;
    byAcquisition: Record<string, number>;
  };
  members: { total: number; active: number };
  loans: { active: number; overdue: number };
  inventoryValue: { amount: string; pricedCopies: number; unpricedCopies: number };
  digitization: DigitizationProgress;
}

export interface DashboardCharts {
  timeZone: string;
  availability: { available: number; issued: number; reserved: number; notLendable: number };
  stockSource: { oldStock: number; newStock: number; donated: number; other: number };
  categories: { categoryId: string | null; name: string; copies: number; titles: number }[];
  monthlyPurchases: { month: string; purchases: number; amount: string; copiesReceived: number }[];
  monthlyCirculation: { month: string; issued: number; returned: number }[];
}

export interface DashboardActivities {
  activity: {
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    actor: string | null;
    createdAt: string;
  }[];
  recentAdditions: {
    id: string;
    accessionNumber: string;
    title: string;
    acquisitionType: string;
    status: string;
    createdAt: string;
  }[];
  dueLoans: {
    id: string;
    accessionNumber: string;
    title: string;
    member: { fullName: string; membershipNumber: string } | null;
    issuedAt: string;
    dueAt: string;
    overdue: boolean;
    daysOverdue: number;
  }[];
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE_URL}/dashboard`;

  summary(): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(`${this.base}/summary`);
  }

  charts(months = 12): Observable<DashboardCharts> {
    return this.http.get<DashboardCharts>(`${this.base}/charts`, {
      params: new HttpParams().set('months', months),
    });
  }

  activities(): Observable<DashboardActivities> {
    return this.http.get<DashboardActivities>(`${this.base}/recent-activities`);
  }

  setRegisterTotal(registerTotal: number | null): Observable<DigitizationProgress> {
    return this.http
      .put<{ digitization: DigitizationProgress }>(`${this.base}/digitization-target`, {
        registerTotal,
      })
      .pipe(map((r) => r.digitization));
  }
}

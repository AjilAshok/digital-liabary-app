import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { toApiError } from '../../core/api/api';
import { AuthService } from '../../core/auth/auth.service';
import { Permissions } from '../../core/auth/auth.models';
import { PageHeader } from '../../shared/ui/page-header';
import { LocationBuilding, LocationsService, ShelfReportRow } from './locations.service';

@Component({
  selector: 'app-locations-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatTooltipModule,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Locations"
      description="Manage the building hierarchy and review stock by shelf."
    >
      @if (canManage()) {
        <a mat-flat-button routerLink="/locations/new" [queryParams]="{ level: 'buildings' }">
          <mat-icon>add_business</mat-icon> Add building
        </a>
        <a mat-stroked-button routerLink="/locations/move">
          <mat-icon>drive_file_move</mat-icon> Move a copy
        </a>
      }
    </app-page-header>

    <section class="locations-section" aria-labelledby="hierarchy-heading">
      <div class="section-heading">
        <div>
          <h2 id="hierarchy-heading">Location hierarchy</h2>
          <p>Building / floor / room / rack / shelf</p>
        </div>
        <span>{{ buildingCount() }} {{ buildingCount() === 1 ? 'building' : 'buildings' }}</span>
      </div>
      @if (treeError()) {
        <div class="state-panel state-panel--error" role="alert">
          <mat-icon>error</mat-icon>
          <p>{{ treeError() }}</p>
          <button mat-stroked-button type="button" (click)="loadTree()">Try again</button>
        </div>
      } @else if (treeLoading()) {
        <div class="state-panel" role="status">
          <mat-icon>account_tree</mat-icon>
          <p>Loading locations…</p>
        </div>
      } @else if (!buildings().length) {
        <div class="state-panel">
          <mat-icon>account_tree</mat-icon>
          <h2>No locations yet</h2>
          <p>
            {{
              canManage()
                ? 'Create a building to begin setting up the shelf hierarchy.'
                : 'The library has not configured any locations yet.'
            }}
          </p>
        </div>
      } @else {
        <div class="location-tree">
          @for (building of buildings(); track building.id) {
            <details class="tree-building" open>
              <summary>
                <span class="location-kind"><mat-icon>business</mat-icon> Building</span>
                <span class="location-code">{{ building.code }}</span><span class="location-name">{{
                  building.name
                }}</span>
                @if (building.address) {
                  <span class="location-muted">{{ building.address }}</span>
                }
                @if (canManage()) {
                  <span class="tree-actions">
                    <a
                      mat-icon-button
                      [routerLink]="['/locations', 'buildings', building.id, 'edit']"
                      aria-label="Edit building"
                      matTooltip="Edit building"
                      ><mat-icon>edit</mat-icon></a
                    >
                    <a
                      mat-icon-button
                      [routerLink]="['/locations/new']"
                      [queryParams]="{ level: 'floors', parentId: building.id }"
                      aria-label="Add floor"
                      matTooltip="Add floor"
                      ><mat-icon>add</mat-icon></a
                    >
                  </span>
                }
              </summary>
              @if (!building.floors.length) {
                <p class="tree-empty">No floors</p>
              }
              @for (floor of building.floors; track floor.id) {
                <details class="tree-floor" open>
                  <summary>
                    <span class="location-kind"><mat-icon>layers</mat-icon> Floor</span
                    ><span class="location-code">{{ floor.code }}</span
                    ><span class="location-name">{{ floor.name }}</span>
                    @if (floor.level !== null) {
                      <span class="location-muted">Level {{ floor.level }}</span>
                    }
                    @if (canManage()) {
                      <span class="tree-actions"
                        ><a
                          mat-icon-button
                          [routerLink]="['/locations', 'floors', floor.id, 'edit']"
                          aria-label="Edit floor"
                          matTooltip="Edit floor"
                          ><mat-icon>edit</mat-icon></a
                        ><a
                          mat-icon-button
                          [routerLink]="['/locations/new']"
                          [queryParams]="{ level: 'rooms', parentId: floor.id }"
                          aria-label="Add room"
                          matTooltip="Add room"
                          ><mat-icon>add</mat-icon></a
                        ></span
                      >
                    }
                  </summary>
                  @if (!floor.rooms.length) {
                    <p class="tree-empty">No rooms</p>
                  }
                  @for (room of floor.rooms; track room.id) {
                    <details class="tree-room" open>
                      <summary>
                        <span class="location-kind"><mat-icon>meeting_room</mat-icon> Room</span
                        ><span class="location-code">{{ room.code }}</span
                        ><span class="location-name">{{ room.name }}</span>
                        @if (canManage()) {
                          <span class="tree-actions"
                            ><a
                              mat-icon-button
                              [routerLink]="['/locations', 'rooms', room.id, 'edit']"
                              aria-label="Edit room"
                              matTooltip="Edit room"
                              ><mat-icon>edit</mat-icon></a
                            ><a
                              mat-icon-button
                              [routerLink]="['/locations/new']"
                              [queryParams]="{ level: 'racks', parentId: room.id }"
                              aria-label="Add rack"
                              matTooltip="Add rack"
                              ><mat-icon>add</mat-icon></a
                            ></span
                          >
                        }
                      </summary>
                      @if (!room.racks.length) {
                        <p class="tree-empty">No racks</p>
                      }
                      @for (rack of room.racks; track rack.id) {
                        <details class="tree-rack" open>
                          <summary>
                            <span class="location-kind"><mat-icon>shelves</mat-icon> Rack</span
                            ><span class="location-code">{{ rack.code }}</span
                            ><span class="location-name">{{ rack.name || rack.code }}</span>
                            @if (canManage()) {
                              <span class="tree-actions"
                                ><a
                                  mat-icon-button
                                  [routerLink]="['/locations', 'racks', rack.id, 'edit']"
                                  aria-label="Edit rack"
                                  matTooltip="Edit rack"
                                  ><mat-icon>edit</mat-icon></a
                                ><a
                                  mat-icon-button
                                  [routerLink]="['/locations/new']"
                                  [queryParams]="{ level: 'shelves', parentId: rack.id }"
                                  aria-label="Add shelf"
                                  matTooltip="Add shelf"
                                  ><mat-icon>add</mat-icon></a
                                ></span
                              >
                            }
                          </summary>
                          @if (!rack.shelves.length) {
                            <p class="tree-empty">No shelves</p>
                          }
                          @for (shelf of rack.shelves; track shelf.id) {
                            <div class="tree-shelf">
                              <span class="location-kind"
                                ><mat-icon>view_agenda</mat-icon> Shelf</span
                              ><span class="location-code">{{ shelf.code }}</span
                              ><span class="location-name">{{ shelf.name || shelf.code }}</span>
                              <span class="location-muted"
                                >{{ shelf.copies
                                }}{{
                                  shelf.capacity === null ? '' : ' / ' + shelf.capacity
                                }}
                                copies</span
                              >
                              @if (canManage() || canReadCopies()) {
                                <span class="tree-actions">
                                  @if (canManage()) {
                                    <a
                                      mat-icon-button
                                      [routerLink]="['/locations', 'shelves', shelf.id, 'edit']"
                                      aria-label="Edit shelf"
                                      matTooltip="Edit shelf"
                                      ><mat-icon>edit</mat-icon></a
                                    >
                                  }
                                  @if (canReadCopies()) {
                                    <a
                                      mat-button
                                      [routerLink]="['/catalogue/copies']"
                                      [queryParams]="{ shelfId: shelf.id }"
                                      >Stock</a
                                    >
                                  }
                                </span>
                              }
                            </div>
                          }
                        </details>
                      }
                    </details>
                  }
                </details>
              }
            </details>
          }
        </div>
      }
    </section>

    <section class="locations-section shelf-report" aria-labelledby="shelf-report-heading">
      <div class="section-heading">
        <div>
          <h2 id="shelf-report-heading">Shelf-wise stock report</h2>
          <p>Active copies by title, availability, and acquisition source.</p>
        </div>
      </div>
      <div class="report-toolbar">
        <mat-form-field class="report-search"
          ><mat-label>Search shelf number</mat-label><mat-icon matPrefix>search</mat-icon
          ><input matInput [formControl]="reportSearch" autocomplete="off" />
          @if (reportSearch.value) {
            <button
              mat-icon-button
              matSuffix
              type="button"
              aria-label="Clear shelf search"
              (click)="reportSearch.setValue('')"
            >
              <mat-icon>close</mat-icon>
            </button>
          }
        </mat-form-field>
        <span>{{ reportTotal() }} shelves</span>
      </div>
      @if (reportError()) {
        <div class="state-panel state-panel--error" role="alert">
          <mat-icon>error</mat-icon>
          <p>{{ reportError() }}</p>
          <button mat-stroked-button type="button" (click)="loadReport()">Try again</button>
        </div>
      } @else if (reportLoading() && !reportRows().length) {
        <div class="state-panel" role="status">
          <mat-icon>assessment</mat-icon>
          <p>Loading shelf report…</p>
        </div>
      } @else if (!reportRows().length) {
        <div class="report-empty">No shelves match this search.</div>
      } @else {
        <div class="report-table-wrap" [attr.aria-busy]="reportLoading()">
          <table class="report-table">
            <thead>
              <tr>
                <th scope="col">Shelf</th>
                <th scope="col">Titles</th>
                <th scope="col">Copies</th>
                <th scope="col">Available</th>
                <th scope="col">Issued</th>
                <th scope="col">Old stock</th>
                <th scope="col">New stock</th>
                <th scope="col">Stock list</th>
              </tr>
            </thead>
            <tbody>
              @for (row of reportRows(); track row.id) {
                <tr>
                  <th scope="row">
                    <span class="report-path">{{ row.path }}</span><span class="location-muted"
                      >{{ row.name }}
                      @if (row.capacity !== null) {
                        · capacity {{ row.capacity }}
                      }
                    </span>
                  </th>
                  <td>{{ row.titles }}</td>
                  <td>{{ row.copies }}</td>
                  <td>{{ row.available }}</td>
                  <td>{{ row.issued }}</td>
                  <td>{{ row.oldStock }}</td>
                  <td>{{ row.newStock }}</td>
                  <td>
                    @if (canReadCopies()) {
                      <a
                        mat-button
                        [routerLink]="['/catalogue/copies']"
                        [queryParams]="{ shelfId: row.id }"
                        >View copies</a
                      >
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <mat-paginator
          [length]="reportTotal()"
          [pageIndex]="reportPage() - 1"
          [pageSize]="reportPageSize()"
          [pageSizeOptions]="[10, 20, 50]"
          (page)="changeReportPage($event)"
          aria-label="Shelf report pages"
        />
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .locations-section {
        margin: 0 0 34px;
      }
      .section-heading {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 12px;
      }
      .section-heading h2 {
        margin: 0 0 4px;
        font: var(--mat-sys-title-large);
      }
      .section-heading p {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
      }
      .section-heading > span {
        color: var(--mat-sys-on-surface-variant);
        white-space: nowrap;
      }
      .location-tree {
        border-block: 1px solid var(--mat-sys-outline-variant);
      }
      .tree-building {
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
      .tree-building:last-child {
        border-bottom: 0;
      }
      details > summary,
      .tree-shelf {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px 14px;
        min-height: 48px;
        padding: 5px 8px;
        list-style: none;
      }
      details > summary {
        cursor: pointer;
      }
      details > summary::-webkit-details-marker {
        display: none;
      }
      details > summary::before {
        content: '▸';
        width: 14px;
        color: var(--mat-sys-on-surface-variant);
      }
      details[open] > summary::before {
        content: '▾';
      }
      .tree-building > summary {
        background: color-mix(in srgb, var(--mat-sys-primary) 7%, var(--mat-sys-surface));
      }
      .tree-floor {
        margin-left: 22px;
        border-left: 1px solid var(--mat-sys-outline-variant);
      }
      .tree-room {
        margin-left: 22px;
        border-left: 1px solid var(--mat-sys-outline-variant);
      }
      .tree-rack {
        margin-left: 22px;
        border-left: 1px solid var(--mat-sys-outline-variant);
      }
      .tree-shelf {
        margin-left: 22px;
        border-left: 1px solid var(--mat-sys-outline-variant);
      }
      .location-kind {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        width: 94px;
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-label-medium);
      }
      .location-kind mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .location-code {
        min-width: 64px;
        font-weight: 600;
      }
      .location-name {
        min-width: 120px;
      }
      .location-muted {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
      }
      .tree-actions {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        margin-left: auto;
      }
      .tree-empty {
        margin: 0 0 8px 50px;
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
      }
      .report-toolbar {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
      }
      .report-toolbar > span {
        margin-top: 12px;
        color: var(--mat-sys-on-surface-variant);
        white-space: nowrap;
      }
      .report-search {
        width: min(100%, 460px);
      }
      .report-table-wrap {
        overflow-x: auto;
        border-block: 1px solid var(--mat-sys-outline-variant);
      }
      .report-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
      }
      .report-table th,
      .report-table td {
        padding: 12px 14px;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
        white-space: nowrap;
      }
      .report-table thead th {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-label-medium);
      }
      .report-path {
        display: block;
        font-weight: 600;
      }
      .report-empty {
        padding: 20px 0;
        border-block: 1px solid var(--mat-sys-outline-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      @media (max-width: 700px) {
        .location-kind {
          width: 80px;
        }
        .tree-floor,
        .tree-room,
        .tree-rack,
        .tree-shelf {
          margin-left: 12px;
        }
        details > summary,
        .tree-shelf {
          gap: 6px 8px;
        }
        .location-name {
          min-width: 80px;
        }
        .tree-actions {
          margin-left: auto;
        }
      }
    `,
  ],
})
export class LocationsPage {
  private readonly locations = inject(LocationsService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly buildings = signal<LocationBuilding[]>([]);
  protected readonly reportRows = signal<ShelfReportRow[]>([]);
  protected readonly buildingCount = signal(0);
  protected readonly reportTotal = signal(0);
  protected readonly reportPage = signal(1);
  protected readonly reportPageSize = signal(20);
  protected readonly treeLoading = signal(true);
  protected readonly reportLoading = signal(true);
  protected readonly treeError = signal<string | null>(null);
  protected readonly reportError = signal<string | null>(null);
  protected readonly reportSearch = new FormControl('', { nonNullable: true });
  protected readonly canManage = computed(() => {
    this.auth.user();
    return this.auth.hasPermission(Permissions.LOCATIONS_MANAGE);
  });
  protected readonly canReadCopies = computed(() => {
    this.auth.user();
    return this.auth.hasPermission(Permissions.COPIES_READ);
  });

  constructor() {
    this.reportSearch.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.reportPage.set(1);
        this.loadReport();
      });
    this.loadTree();
    this.loadReport();
  }

  protected loadTree(): void {
    this.treeLoading.set(true);
    this.treeError.set(null);
    this.locations.tree().subscribe({
      next: (result) => {
        this.buildings.set(result.data);
        this.buildingCount.set(result.data.length);
        this.treeLoading.set(false);
      },
      error: (err: unknown) => {
        this.treeError.set(toApiError(err).message);
        this.treeLoading.set(false);
      },
    });
  }

  protected loadReport(): void {
    this.reportLoading.set(true);
    this.reportError.set(null);
    this.locations
      .shelfReport(this.reportPage(), this.reportPageSize(), this.reportSearch.value)
      .subscribe({
        next: (result) => {
          this.reportRows.set(result.data);
          this.reportTotal.set(result.meta.total);
          this.reportLoading.set(false);
        },
        error: (err: unknown) => {
          this.reportError.set(toApiError(err).message);
          this.reportLoading.set(false);
        },
      });
  }

  protected changeReportPage(event: PageEvent): void {
    this.reportPage.set(event.pageIndex + 1);
    this.reportPageSize.set(event.pageSize);
    this.loadReport();
  }
}

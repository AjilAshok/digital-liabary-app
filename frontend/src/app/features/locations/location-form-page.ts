import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toApiError } from '../../core/api/api';
import { PageHeader } from '../../shared/ui/page-header';
import {
  LocationBuilding,
  LocationInput,
  LocationLevel,
  LocationsService,
} from './locations.service';

const LOCATION_LEVELS: LocationLevel[] = ['buildings', 'floors', 'rooms', 'racks', 'shelves'];
const LEVEL_LABELS: Record<LocationLevel, string> = {
  buildings: 'Building',
  floors: 'Floor',
  rooms: 'Room',
  racks: 'Rack',
  shelves: 'Shelf',
};

@Component({
  selector: 'app-location-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [title]="heading()" [description]="description()">
      <a mat-stroked-button routerLink="/locations"><mat-icon>arrow_back</mat-icon> Locations</a>
    </app-page-header>

    @if (error()) {
      <div class="location-error" role="alert">
        <mat-icon>error</mat-icon><span>{{ error() }}</span>
      </div>
    }
    @if (loading()) {
      <div class="state-panel" role="status">
        <mat-icon>account_tree</mat-icon>
        <p>Loading location…</p>
      </div>
    } @else if (level && (mode === 'edit' || level === 'buildings' || parentId)) {
      <form class="location-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (parentName()) {
          <p class="parent-context">
            Parent: <strong>{{ parentName() }}</strong>
          </p>
        }
        <div class="location-form-grid">
          <mat-form-field
            ><mat-label>{{ label() }} code</mat-label
            ><input
              matInput
              formControlName="code"
              required
              maxlength="20"
              autocomplete="off"
            /><mat-hint>Letters, digits, dot, underscore and hyphen.</mat-hint
            ><mat-error>Enter a valid code.</mat-error></mat-form-field
          >
          <mat-form-field
            ><mat-label>{{ label() }} name</mat-label
            ><input matInput formControlName="name" required maxlength="120" /><mat-error
              >Name is required.</mat-error
            ></mat-form-field
          >
          @if (level === 'buildings') {
            <mat-form-field class="wide"
              ><mat-label>Address</mat-label
              ><textarea matInput rows="3" formControlName="address" maxlength="500"></textarea>
            </mat-form-field>
          }
          @if (level === 'floors') {
            <mat-form-field
              ><mat-label>Floor level</mat-label
              ><input
                matInput
                type="number"
                formControlName="floorLevel"
                min="-10"
                max="200"
              /><mat-hint>Optional numeric floor position.</mat-hint
              ><mat-error>Use a level from -10 to 200.</mat-error></mat-form-field
            >
          }
          @if (level === 'shelves') {
            <mat-form-field
              ><mat-label>Capacity</mat-label
              ><input
                matInput
                type="number"
                formControlName="capacity"
                min="0"
                max="100000"
              /><mat-hint>Leave blank for unlimited capacity.</mat-hint
              ><mat-error>Capacity must be from 0 to 100,000.</mat-error></mat-form-field
            >
          }
        </div>
        <div class="location-form-actions">
          <button mat-flat-button type="submit" [disabled]="saving()">
            <mat-icon>{{ saving() ? 'hourglass_top' : 'save' }}</mat-icon>{{
              saving() ? 'Saving…' : 'Save ' + label().toLowerCase()
            }}</button
          ><a mat-button routerLink="/locations">Cancel</a>
        </div>
      </form>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .location-error {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        max-width: 860px;
        padding: 14px 16px;
        margin-bottom: 18px;
        border-left: 4px solid var(--mat-sys-error);
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .location-form {
        max-width: 860px;
      }
      .parent-context {
        padding: 12px 0;
        border-block: 1px solid var(--mat-sys-outline-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      .location-form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px 18px;
        padding-top: 16px;
      }
      .location-form-grid mat-form-field {
        width: 100%;
      }
      .location-form-grid .wide {
        grid-column: 1 / -1;
      }
      .location-form-actions {
        display: flex;
        gap: 10px;
        padding: 12px 0 28px;
      }
      @media (max-width: 650px) {
        .location-form-grid {
          grid-template-columns: 1fr;
        }
        .location-form-grid .wide {
          grid-column: auto;
        }
      }
    `,
  ],
})
export class LocationFormPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly locations = inject(LocationsService);
  protected readonly mode = this.route.snapshot.paramMap.get('locationId') ? 'edit' : 'create';
  protected readonly locationId = this.route.snapshot.paramMap.get('locationId');
  protected readonly level = this.resolveLevel();
  protected readonly parentId = this.route.snapshot.queryParamMap.get('parentId');
  protected readonly form = this.fb.nonNullable.group({
    code: [
      '',
      [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9._-]+$/)],
    ],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    address: ['', Validators.maxLength(500)],
    floorLevel: this.fb.control<number | null>(null, [Validators.min(-10), Validators.max(200)]),
    capacity: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(100_000)]),
  });
  protected readonly loading = signal(this.mode === 'edit');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly parentName = signal<string | null>(null);

  constructor() {
    if (!this.level) {
      this.error.set('Location level is missing or invalid.');
      this.loading.set(false);
      return;
    }
    if (this.mode === 'create' && this.level !== 'buildings' && !this.parentId) {
      this.error.set('Select a parent location before creating this record.');
      this.loading.set(false);
      return;
    }
    if (this.mode === 'edit') this.loadLocation();
    else if (this.parentId) this.loadParentName();
  }

  protected label(): string {
    return this.level ? LEVEL_LABELS[this.level] : 'Location';
  }

  protected heading(): string {
    return `${this.mode === 'create' ? 'Add' : 'Edit'} ${this.label().toLowerCase()}`;
  }

  protected description(): string {
    return this.mode === 'create'
      ? 'Create this level under its selected parent in the library location hierarchy.'
      : 'Update the code or name. Parent relationships remain fixed to preserve the hierarchy.';
  }

  protected save(): void {
    if (!this.level || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const values = this.form.getRawValue();
    const input: LocationInput = {
      code: values.code.trim(),
      name: values.name.trim(),
      ...(this.level === 'buildings' ? { address: values.address.trim() || null } : {}),
      ...(this.level === 'floors' ? { level: values.floorLevel } : {}),
      ...(this.level === 'shelves' ? { capacity: values.capacity } : {}),
      ...(this.mode === 'create' && this.parentId ? { parentId: this.parentId } : {}),
    };
    this.error.set(null);
    this.saving.set(true);
    const request =
      this.mode === 'edit' && this.locationId
        ? this.locations.update(this.level, this.locationId, input)
        : this.locations.create(this.level, input);
    request.subscribe({
      next: () => void this.router.navigate(['/locations']),
      error: (err: unknown) => {
        const apiError = toApiError(err);
        this.error.set(
          apiError.fieldErrors.length
            ? `${apiError.message}: ${apiError.fieldErrors.map((issue) => issue.message).join('; ')}`
            : apiError.message,
        );
        this.saving.set(false);
      },
    });
  }

  private resolveLevel(): LocationLevel | null {
    const raw =
      this.route.snapshot.paramMap.get('level') ?? this.route.snapshot.queryParamMap.get('level');
    return raw && LOCATION_LEVELS.includes(raw as LocationLevel) ? (raw as LocationLevel) : null;
  }

  private loadParentName(): void {
    this.locations.tree().subscribe({
      next: (result) => {
        this.parentName.set(this.findName(result.data, this.parentId!));
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(toApiError(err).message);
        this.loading.set(false);
      },
    });
  }

  private loadLocation(): void {
    this.locations.tree().subscribe({
      next: (result) => {
        const item = this.findLocation(result.data, this.level!, this.locationId!);
        if (!item) {
          this.error.set(`${this.label()} not found.`);
        } else {
          this.form.patchValue({
            code: item.code,
            name: item.name ?? item.code,
            address: 'address' in item ? (item.address ?? '') : '',
            floorLevel: 'level' in item ? item.level : null,
            capacity: 'capacity' in item ? item.capacity : null,
          });
        }
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(toApiError(err).message);
        this.loading.set(false);
      },
    });
  }

  private findName(buildings: LocationBuilding[], id: string): string | null {
    const found = this.findLocation(buildings, null, id);
    return found?.name ?? found?.code ?? null;
  }

  private findLocation(buildings: LocationBuilding[], level: LocationLevel | null, id: string) {
    for (const building of buildings) {
      if ((!level || level === 'buildings') && building.id === id) return building;
      for (const floor of building.floors) {
        if ((!level || level === 'floors') && floor.id === id) return floor;
        for (const room of floor.rooms) {
          if ((!level || level === 'rooms') && room.id === id) return room;
          for (const rack of room.racks) {
            if ((!level || level === 'racks') && rack.id === id) return rack;
            for (const shelf of rack.shelves) {
              if ((!level || level === 'shelves') && shelf.id === id) return shelf;
            }
          }
        }
      }
    }
    return null;
  }
}

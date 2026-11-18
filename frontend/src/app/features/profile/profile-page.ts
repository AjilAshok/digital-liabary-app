import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { toApiError } from '../../core/api/api';
import { AuthService } from '../../core/auth/auth.service';
import { FieldError } from '../../shared/forms/field-error';
import { FormActions } from '../../shared/forms/form-actions';
import { PasswordField } from '../../shared/forms/password-field';
import { applyServerErrors } from '../../shared/forms/server-errors';
import { CellDef, DataTable, TableColumn } from '../../shared/ui/data-table/data-table';
import { PageHeader } from '../../shared/ui/page-header';
import { ActivityItem, ProfileService } from './profile.service';

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'auth.logout_all': 'Signed out on all devices',
  'auth.login_failed': 'Failed sign-in attempt',
  'auth.login_blocked': 'Sign-in blocked (account locked)',
  'auth.account_locked': 'Account locked after failed attempts',
  'user.profile_updated': 'Profile updated',
  'user.password_changed': 'Password changed',
  'user.password_change_failed': 'Password change rejected',
};

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const next = group.get('newPassword')?.value as string;
  const confirm = group.get('confirmPassword');
  if (confirm && confirm.value && next !== confirm.value) {
    confirm.setErrors({ ...(confirm.errors ?? {}), mismatch: true });
  } else if (confirm?.hasError('mismatch')) {
    const { mismatch: _m, ...rest } = confirm.errors ?? {};
    confirm.setErrors(Object.keys(rest).length ? rest : null);
  }
  return null;
}

@Component({
  selector: 'app-profile-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    PageHeader,
    FieldError,
    FormActions,
    PasswordField,
    DataTable,
    CellDef,
  ],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage {
  private readonly auth = inject(AuthService);
  private readonly profile = inject(ProfileService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly user = this.auth.user;

  // ── Profile details ─────────────────────────────────────────────────────
  protected readonly detailsForm = this.fb.group({
    fullName: ['', [Validators.required, Validators.maxLength(120)]],
  });
  protected readonly savingDetails = signal(false);
  protected readonly detailsError = signal<string | null>(null);

  // ── Password ────────────────────────────────────────────────────────────
  protected readonly passwordForm = this.fb.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(128)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );
  protected readonly savingPassword = signal(false);
  protected readonly passwordError = signal<string | null>(null);

  // ── Activity table ──────────────────────────────────────────────────────
  protected readonly columns: TableColumn<ActivityItem>[] = [
    { key: 'createdAt', header: 'When' },
    { key: 'action', header: 'Activity', value: (r) => ACTION_LABELS[r.action] ?? r.action },
    { key: 'ipAddress', header: 'IP address', value: (r) => r.ipAddress, hideOnMobile: true },
  ];
  protected readonly activity = signal<ActivityItem[]>([]);
  protected readonly activityTotal = signal(0);
  protected readonly activityPage = signal(0);
  protected readonly activityPageSize = signal(10);
  protected readonly activityLoading = signal(false);
  protected readonly activityError = signal<string | null>(null);

  constructor() {
    // Keep the form in sync with the signed-in user (e.g. after a save).
    effect(() => {
      const u = this.user();
      if (u && !this.detailsForm.dirty) this.detailsForm.setValue({ fullName: u.fullName });
    });
    this.loadActivity();
  }

  protected saveDetails(): void {
    if (this.detailsForm.invalid || this.savingDetails()) {
      this.detailsForm.markAllAsTouched();
      return;
    }
    this.savingDetails.set(true);
    this.detailsError.set(null);
    this.profile.updateProfile(this.detailsForm.getRawValue().fullName).subscribe({
      next: (user) => {
        this.savingDetails.set(false);
        this.detailsForm.reset({ fullName: user.fullName });
        this.snackBar.open('Profile saved.', 'Dismiss', { duration: 3000 });
        this.loadActivity();
      },
      error: (err: unknown) => {
        this.savingDetails.set(false);
        const apiError = toApiError(err);
        const unmatched = applyServerErrors(this.detailsForm, apiError);
        this.detailsError.set(
          apiError.fieldErrors.length && !unmatched.length ? null : apiError.message,
        );
      },
    });
  }

  protected changePassword(): void {
    if (this.passwordForm.invalid || this.savingPassword()) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.savingPassword.set(true);
    this.passwordError.set(null);
    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.profile.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.passwordForm.reset();
        this.snackBar.open('Password changed. Other devices have been signed out.', 'Dismiss', {
          duration: 5000,
        });
        this.loadActivity();
      },
      error: (err: unknown) => {
        this.savingPassword.set(false);
        const apiError = toApiError(err);
        const unmatched = applyServerErrors(this.passwordForm, apiError);
        this.passwordError.set(
          apiError.fieldErrors.length && !unmatched.length ? null : apiError.message,
        );
      },
    });
  }

  protected onActivityPage(event: PageEvent): void {
    this.activityPage.set(event.pageIndex);
    this.activityPageSize.set(event.pageSize);
    this.loadActivity();
  }

  protected loadActivity(): void {
    this.activityLoading.set(true);
    this.activityError.set(null);
    this.profile.activity(this.activityPage() + 1, this.activityPageSize()).subscribe({
      next: (res) => {
        this.activity.set(res.data);
        this.activityTotal.set(res.meta.total);
        this.activityLoading.set(false);
      },
      error: (err: unknown) => {
        this.activityError.set(toApiError(err).message);
        this.activityLoading.set(false);
      },
    });
  }

  protected readonly trackById = (row: ActivityItem) => row.id;
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl } from '@angular/forms';
import { EMPTY, merge } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';

/**
 * Message for the first error on a control. Server-side validation messages (set by
 * `applyServerErrors`) are stored under the `server` key and shown verbatim.
 */
export function controlErrorMessage(control: AbstractControl | null, label: string): string | null {
  const errors = control?.errors;
  if (!errors) return null;
  if (errors['server']) return String(errors['server']);
  if (errors['required']) return `${label} is required`;
  if (errors['email']) return 'Enter a valid email address';
  if (errors['minlength']) {
    return `${label} must be at least ${(errors['minlength'] as { requiredLength: number }).requiredLength} characters`;
  }
  if (errors['maxlength']) {
    return `${label} must be at most ${(errors['maxlength'] as { requiredLength: number }).requiredLength} characters`;
  }
  if (errors['pattern']) return `${label} has an invalid format`;
  if (errors['mismatch']) return `${label} does not match`;
  return `${label} is invalid`;
}

/**
 * Renders the validation message for a control. Use inside `<mat-error>`:
 * `<mat-error><app-field-error [control]="form.controls.email" label="Email" /></mat-error>`
 */
@Component({
  selector: 'app-field-error',
  template: '{{ message() }}',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldError {
  readonly control = input.required<AbstractControl>();
  readonly label = input('This field');

  /** Re-evaluated whenever the control's value or status changes. */
  private readonly tick = toSignal(
    toObservable(this.control).pipe(
      switchMap((c) => (c ? merge(c.statusChanges, c.valueChanges) : EMPTY)),
    ),
  );

  protected readonly message = computed(() => {
    this.tick();
    return controlErrorMessage(this.control(), this.label());
  });
}

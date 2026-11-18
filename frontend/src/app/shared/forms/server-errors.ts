import { FormGroup } from '@angular/forms';
import { ApiError } from '../../core/api/api';

/**
 * Copies field-level API validation errors (422 `details[]`) onto matching form controls as
 * `{ server: message }`. Returns the issues that did not match a control, so the caller can
 * show them as a form-level message.
 */
export function applyServerErrors(form: FormGroup, error: ApiError): string[] {
  const unmatched: string[] = [];
  for (const issue of error.fieldErrors) {
    const control = issue.path ? form.get(issue.path) : null;
    if (control) {
      control.setErrors({ ...(control.errors ?? {}), server: issue.message });
      control.markAsTouched();
    } else {
      unmatched.push(issue.message);
    }
  }
  return unmatched;
}

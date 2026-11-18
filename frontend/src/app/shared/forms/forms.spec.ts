import { FormControl, FormGroup, Validators } from '@angular/forms';
import { controlErrorMessage } from './field-error';
import { applyServerErrors } from './server-errors';

describe('controlErrorMessage', () => {
  it('maps validator errors to readable messages', () => {
    const c = new FormControl('', [Validators.required]);
    expect(controlErrorMessage(c, 'Email')).toBe('Email is required');
    c.setValue('x');
    expect(controlErrorMessage(c, 'Email')).toBeNull();

    const email = new FormControl('bad', [Validators.email]);
    expect(controlErrorMessage(email, 'Email')).toBe('Enter a valid email address');

    const min = new FormControl('abc', [Validators.minLength(10)]);
    expect(controlErrorMessage(min, 'Password')).toBe('Password must be at least 10 characters');
  });

  it('prefers server messages verbatim', () => {
    const c = new FormControl('x');
    c.setErrors({ server: 'Current password is incorrect' });
    expect(controlErrorMessage(c, 'Current password')).toBe('Current password is incorrect');
  });
});

describe('applyServerErrors', () => {
  it('sets matching controls and returns unmatched messages', () => {
    const form = new FormGroup({ currentPassword: new FormControl('') });
    const unmatched = applyServerErrors(form, {
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      fieldErrors: [
        { path: 'currentPassword', message: 'Current password is incorrect' },
        { path: 'somethingElse', message: 'Other problem' },
      ],
    });
    expect(form.controls.currentPassword.errors).toEqual({
      server: 'Current password is incorrect',
    });
    expect(form.controls.currentPassword.touched).toBe(true);
    expect(unmatched).toEqual(['Other problem']);
  });
});

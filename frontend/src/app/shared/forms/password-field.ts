import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { FieldError } from './field-error';

/** Password input with show/hide toggle and validation message. */
@Component({
  selector: 'app-password-field',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    FieldError,
  ],
  template: `
    <mat-form-field class="full-width">
      <mat-label>{{ label() }}</mat-label>
      <input
        matInput
        [type]="hidden() ? 'password' : 'text'"
        [formControl]="control()"
        [attr.autocomplete]="autocomplete()"
        [required]="required()"
      />
      <button
        mat-icon-button
        matSuffix
        type="button"
        (click)="hidden.set(!hidden())"
        [attr.aria-label]="hidden() ? 'Show ' + label() : 'Hide ' + label()"
        [attr.aria-pressed]="!hidden()"
      >
        <mat-icon>{{ hidden() ? 'visibility' : 'visibility_off' }}</mat-icon>
      </button>
      @if (hint()) {
        <mat-hint>{{ hint() }}</mat-hint>
      }
      <mat-error><app-field-error [control]="control()" [label]="label()" /></mat-error>
    </mat-form-field>
  `,
  styles: '.full-width { width: 100%; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordField {
  readonly control = input.required<FormControl<string>>();
  readonly label = input('Password');
  readonly autocomplete = input<'current-password' | 'new-password'>('current-password');
  readonly hint = input<string>();
  readonly required = input(true);
  protected readonly hidden = signal(true);
}

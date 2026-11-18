import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forbidden-page',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <div class="state-panel">
      <mat-icon aria-hidden="true">lock</mat-icon>
      <h1>Access denied</h1>
      <p>Your role does not include permission to open this page.</p>
      <a mat-flat-button routerLink="/dashboard">Back to dashboard</a>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForbiddenPage {}

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <div class="state-panel">
      <mat-icon aria-hidden="true">search_off</mat-icon>
      <h1>Page not found</h1>
      <p>The page you requested does not exist or has moved.</p>
      <a mat-flat-button routerLink="/dashboard">Back to dashboard</a>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {}

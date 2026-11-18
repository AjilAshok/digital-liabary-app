import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

export interface Breadcrumb {
  label: string;
  /** Null for grouping routes that have no page of their own. */
  url: string | null;
}

/**
 * Builds breadcrumbs from `route.data.breadcrumb` along the active route chain.
 * Set `data.breadcrumbLink: false` on grouping routes that have no page of their own.
 */
export function buildBreadcrumbs(root: ActivatedRouteSnapshot): Breadcrumb[] {
  const crumbs: Breadcrumb[] = [];
  const segments: string[] = [];
  let route: ActivatedRouteSnapshot | null = root;
  while (route) {
    segments.push(...route.url.map((s) => s.path));
    const label = route.routeConfig?.data?.['breadcrumb'] as string | undefined;
    if (label && (crumbs.length === 0 || crumbs[crumbs.length - 1]!.label !== label)) {
      const linkable = route.routeConfig?.data?.['breadcrumbLink'] !== false;
      crumbs.push({ label, url: linkable ? '/' + segments.join('/') : null });
    }
    route = route.firstChild;
  }
  return crumbs;
}

@Component({
  selector: 'app-breadcrumbs',
  imports: [RouterLink],
  template: `
    @if (crumbs().length > 1) {
      <nav aria-label="Breadcrumb" class="breadcrumbs">
        <ol>
          @for (crumb of crumbs(); track $index; let last = $last) {
            <li>
              @if (last) {
                <span aria-current="page">{{ crumb.label }}</span>
              } @else if (crumb.url) {
                <a [routerLink]="crumb.url">{{ crumb.label }}</a>
              } @else {
                <span>{{ crumb.label }}</span>
              }
            </li>
          }
        </ol>
      </nav>
    }
  `,
  styles: `
    .breadcrumbs ol {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      list-style: none;
      margin: 0 0 12px;
      padding: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    li + li::before {
      content: '›';
      margin-right: 4px;
    }
    a {
      color: var(--mat-sys-primary);
      text-decoration: none;
    }
    a:hover,
    a:focus-visible {
      text-decoration: underline;
    }
    [aria-current='page'] {
      color: var(--mat-sys-on-surface);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Breadcrumbs {
  private readonly router = inject(Router);

  protected readonly crumbs = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => buildBreadcrumbs(this.router.routerState.snapshot.root)),
    ),
    { initialValue: [] as Breadcrumb[] },
  );
}

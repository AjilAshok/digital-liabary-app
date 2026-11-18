import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { AuthService } from './auth.service';

/**
 * Renders its content only when the user holds every given permission:
 * `<button *appHasPermission="'catalogue.write'">`.
 * This hides UI only; authorization is enforced by the backend.
 */
@Directive({ selector: '[appHasPermission]' })
export class HasPermissionDirective {
  private readonly auth = inject(AuthService);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);

  readonly appHasPermission = input.required<string | string[]>();
  private rendered = false;

  constructor() {
    effect(() => {
      const required = this.appHasPermission();
      const allowed = this.auth.hasAllPermissions(Array.isArray(required) ? required : [required]);
      if (allowed && !this.rendered) {
        this.container.createEmbeddedView(this.template);
        this.rendered = true;
      } else if (!allowed && this.rendered) {
        this.container.clear();
        this.rendered = false;
      }
    });
  }
}

import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Breadcrumbs } from './breadcrumbs';

@Component({ template: '' })
class Blank {}

describe('Breadcrumbs', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Breadcrumbs],
      providers: [
        provideRouter([
          { path: 'dashboard', component: Blank, data: { breadcrumb: 'Dashboard' } },
          {
            path: 'admin',
            data: { breadcrumb: 'Administration', breadcrumbLink: false },
            children: [{ path: 'roles', component: Blank, data: { breadcrumb: 'Roles' } }],
          },
        ]),
      ],
    });
  });

  async function render(url: string) {
    const fixture = TestBed.createComponent(Breadcrumbs);
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the trail with a non-link group and the current page marked', async () => {
    const el = await render('/admin/roles');
    const items = [...el.querySelectorAll('li')].map((li) => li.textContent?.trim());
    expect(items).toEqual(['Administration', 'Roles']);
    expect(el.querySelector('a')).toBeNull(); // the group has no page of its own
    expect(el.querySelector('[aria-current="page"]')?.textContent).toBe('Roles');
    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe('Breadcrumb');
  });

  it('hides itself for top-level pages', async () => {
    const el = await render('/dashboard');
    expect(el.querySelector('nav')).toBeNull();
  });
});

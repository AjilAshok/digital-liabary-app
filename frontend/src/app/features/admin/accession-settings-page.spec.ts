import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ConfirmService } from '../../shared/ui/confirm-dialog';
import { AccessionSettingsPage } from './accession-settings-page';

describe('Book number settings', () => {
  it('loads the existing settings, previews changes and saves only after confirmation', () => {
    const confirm = vi.fn().mockReturnValue(of(false));
    TestBed.configureTestingModule({
      imports: [AccessionSettingsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfirmService, useValue: { confirm } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AccessionSettingsPage);
    http.expectOne('/api/v1/settings/accession').flush({
      configured: true,
      config: { prefix: 'lib', nextValue: 1, padding: 6 },
      preview: 'lib000001',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('lib000001');
    const page = fixture.componentInstance as unknown as { save(): void };
    page.save();
    expect(confirm).toHaveBeenCalledOnce();
    http.expectNone((request) => request.method === 'PUT');
    confirm.mockReturnValue(of(true));
    page.save();
    const request = http.expectOne('/api/v1/settings/accession');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ prefix: 'lib', nextValue: 1, padding: 6 });
    request.flush({ configured: true, config: request.request.body, preview: 'lib000001' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('settings saved');
    http.verify();
  });

  it('does not offer a save form when loading settings fails', () => {
    TestBed.configureTestingModule({
      imports: [AccessionSettingsPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AccessionSettingsPage);
    http
      .expectOne('/api/v1/settings/accession')
      .flush(
        { error: { code: 'FORBIDDEN', message: 'Not allowed' } },
        { status: 403, statusText: 'Forbidden' },
      );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Not allowed');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    http.verify();
  });
});

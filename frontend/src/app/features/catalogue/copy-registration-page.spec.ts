import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { CatalogueService } from './catalogue.service';
import { CopyRegistrationPage } from './copy-registration-page';

describe('scan copy registration', () => {
  it('offers the next scan only after a physical copy is saved', async () => {
    const catalogue = {
      book: vi.fn().mockReturnValue(of({ id: 'book', title: 'Book', editions: [] })),
      shelves: vi.fn().mockReturnValue(of({ data: [] })),
      registerCopies: vi
        .fn()
        .mockReturnValue(
          of({ copies: [{ id: 'copy', accessionNumber: 'A-1', status: 'AVAILABLE' }] }),
        ),
    };
    TestBed.configureTestingModule({
      imports: [CopyRegistrationPage],
      providers: [
        provideRouter([]),
        { provide: CatalogueService, useValue: catalogue },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ editionId: 'edition' }),
              queryParamMap: convertToParamMap({ bookId: 'book', fromScan: 'isbn' }),
            },
          },
        },
      ],
    });
    TestBed.inject(AuthService).setUser({
      id: 'user',
      email: 'test@example.test',
      fullName: 'Test',
      roles: [],
      permissions: ['copies.write'],
      lastLoginAt: null,
    });
    const fixture = TestBed.createComponent(CopyRegistrationPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Scan next book');
    (fixture.componentInstance as unknown as { save(): void }).save();
    fixture.detectChanges();
    expect(catalogue.registerCopies).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain('Scan next book');
    expect(fixture.nativeElement.querySelector('a[href="/scanner/isbn"]')).not.toBeNull();
  });
});

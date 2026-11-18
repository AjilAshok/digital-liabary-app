import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { ImportPage } from './import-page';

describe('ImportPage', () => {
  it('uploads a file, displays errors and only imports rows marked ready', async () => {
    TestBed.configureTestingModule({
      imports: [ImportPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService).setUser({
      id: 'user',
      email: 'admin@example.test',
      fullName: 'Admin',
      roles: ['ADMIN'],
      permissions: ['imports.manage', 'catalogue.write', 'copies.write', 'locations.manage'],
      lastLoginAt: null,
    });
    const fixture = TestBed.createComponent(ImportPage);
    const http = TestBed.inject(HttpTestingController);
    const component = fixture.componentInstance as unknown as {
      file: { set(file: File): void };
      upload(): void;
      importValid(): void;
    };
    component.file.set(new File(['xlsx'], 'books.xlsx'));
    component.upload();
    const request = http.expectOne('/api/v1/imports/upload');
    expect(request.request.method).toBe('POST');
    expect((request.request.body as FormData).get('file')).toBeInstanceOf(File);
    const values = {
      title: 'Book',
      authorName: '',
      authorNumber: '',
      isbn: '',
      accessionNumber: 'A1',
      shelfRack: '',
      price: '',
      oldNew: 'OLD',
      condition: 'GOOD',
    };
    const batch = {
      id: 'batch',
      fileName: 'books.xlsx',
      totalRows: 2,
      validRows: 1,
      invalidRows: 0,
      duplicateRows: 1,
      importedRows: 0,
      rows: [
        {
          id: 'ready',
          rowNumber: 2,
          status: 'VALID',
          rawData: { values },
          normalizedData: null,
          errors: [],
        },
        {
          id: 'duplicate',
          rowNumber: 3,
          status: 'DUPLICATE',
          rawData: { values },
          normalizedData: null,
          errors: [{ field: 'accessionNumber', message: 'Already exists' }],
        },
      ],
    };
    request.flush(batch);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Duplicate book number');
    component.importValid();
    const confirm = http.expectOne('/api/v1/imports/batch/confirm');
    expect(confirm.request.body).toEqual({ rowIds: ['ready'] });
    confirm.flush({ ...batch, validRows: 0, importedRows: 1 });
    http.verify();
  });
});

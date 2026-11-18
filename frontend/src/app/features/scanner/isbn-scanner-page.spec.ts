import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BrowserCodeReader } from '@zxing/browser';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ScannerService } from './scanner.service';
import { IsbnScannerPage, isValidIsbn } from './isbn-scanner-page';

describe('ISBN scanner validation', () => {
  it('accepts valid ISBN-10 and ISBN-13 values with common separators', () => {
    expect(isValidIsbn('0-306-40615-2')).toBe(true);
    expect(isValidIsbn('978-0-306-40615-7')).toBe(true);
  });

  it('rejects invalid check digits and unsupported barcode text', () => {
    expect(isValidIsbn('9780306406158')).toBe(false);
    expect(isValidIsbn('not an ISBN')).toBe(false);
  });
});

describe('ISBN camera workflow', () => {
  afterEach(() => vi.restoreAllMocks());

  it('pauses repeated barcode reads until scan next is selected', async () => {
    const lookupIsbn = vi.fn().mockReturnValue(
      of({
        valid: true,
        isbn13: '9780306406157',
        localMatches: [],
        suggestions: [],
        providerErrors: [],
      }),
    );
    TestBed.configureTestingModule({
      imports: [IsbnScannerPage],
      providers: [provideRouter([]), { provide: ScannerService, useValue: { lookupIsbn } }],
    });
    TestBed.inject(AuthService).setUser({
      id: 'user',
      email: 'test@example.test',
      fullName: 'Test',
      roles: [],
      permissions: ['scanner.use'],
      lastLoginAt: null,
    });
    const fixture = TestBed.createComponent(IsbnScannerPage);
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as {
      secureContext: boolean;
      reader: { decodeFromVideoDevice: ReturnType<typeof vi.fn> };
      startCamera(): Promise<void>;
      scanNext(): void;
      scanPaused(): boolean;
    };
    Object.defineProperty(page, 'secureContext', { value: true });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
    vi.spyOn(BrowserCodeReader, 'listVideoInputDevices').mockResolvedValue([]);
    let callback: ((result: { getText(): string }) => void) | undefined;
    vi.spyOn(page.reader, 'decodeFromVideoDevice').mockImplementation(
      async (_device, _video, handler) => {
        callback = handler;
        return { stop: vi.fn() };
      },
    );
    await page.startCamera();
    callback?.({ getText: () => '9780306406157' });
    callback?.({ getText: () => '9780306406157' });
    expect(lookupIsbn).toHaveBeenCalledTimes(1);
    expect(page.scanPaused()).toBe(true);
    page.scanNext();
    callback?.({ getText: () => '9780306406157' });
    expect(lookupIsbn).toHaveBeenCalledTimes(2);
    fixture.destroy();
  });

  it('offers manual entry when the camera is denied', async () => {
    TestBed.configureTestingModule({
      imports: [IsbnScannerPage],
      providers: [provideRouter([]), { provide: ScannerService, useValue: {} }],
    });
    const fixture = TestBed.createComponent(IsbnScannerPage);
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as {
      secureContext: boolean;
      startCamera(): Promise<void>;
      cameraError(): string | null;
    };
    Object.defineProperty(page, 'secureContext', { value: true });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
    vi.spyOn(BrowserCodeReader, 'listVideoInputDevices').mockRejectedValue(
      new DOMException('Denied', 'NotAllowedError'),
    );
    await page.startCamera();
    expect(page.cameraError()).toContain('permission was denied');
    expect(page.cameraError()).toContain('manually');
  });
});

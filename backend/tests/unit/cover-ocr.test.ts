import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as OcrProviders from '../../src/modules/scanner/ocr.providers.js';

const mocks = vi.hoisted(() => ({
  getOcrProvider: vi.fn(),
  getPrisma: vi.fn(),
  searchLibrary: vi.fn(),
  searchGoogleBooksByText: vi.fn(),
  searchOpenLibraryByText: vi.fn(),
}));

vi.mock('../../src/modules/scanner/ocr.providers.js', async (importOriginal) => ({
  ...(await importOriginal<typeof OcrProviders>()),
  getOcrProvider: mocks.getOcrProvider,
}));
vi.mock('../../src/db/prisma.js', () => ({ getPrisma: mocks.getPrisma }));
vi.mock('../../src/modules/search/search.service.js', () => ({
  searchLibrary: mocks.searchLibrary,
}));
vi.mock('../../src/modules/scanner/metadata.providers.js', () => ({
  searchGoogleBooksByText: mocks.searchGoogleBooksByText,
  searchOpenLibraryByText: mocks.searchOpenLibraryByText,
}));

import { GoogleVisionOcrProvider } from '../../src/modules/scanner/ocr.providers.js';
import { extractOcrFields, searchCoverImage } from '../../src/modules/scanner/cover-ocr.service.js';

const localMiss = { books: { data: [], meta: { total: 0 } }, authors: [], exactCopy: null };
const ocrText = 'THE LONG ROAD\nJane Example\nNorth Press\nISBN 978-0-306-40615-7';

function setupProvider(text = ocrText) {
  mocks.getOcrProvider.mockReturnValue({
    name: 'TEST_OCR',
    extract: vi.fn().mockResolvedValue({ provider: 'TEST_OCR', text, confidence: 0.91 }),
  });
  mocks.getPrisma.mockReturnValue({ scanLog: { create: vi.fn().mockResolvedValue({}) } });
  mocks.searchLibrary.mockResolvedValue(localMiss);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('cover OCR', () => {
  it('extracts title, author and publisher candidates while stripping ISBN text', () => {
    expect(extractOcrFields(ocrText)).toEqual({
      title: 'THE LONG ROAD',
      authors: ['Jane Example'],
      publisher: 'North Press',
    });
  });

  it('searches local records first and skips metadata providers on a local hit', async () => {
    setupProvider();
    const localHit = {
      books: { data: [{ id: 'book-1' }], meta: { total: 1 } },
      authors: [],
      exactCopy: null,
    };
    mocks.searchLibrary.mockResolvedValue(localHit);

    const result = await searchCoverImage(Buffer.from('image'), 'jpeg', 'user-1');

    expect(result.local).toBe(localHit);
    expect(mocks.searchGoogleBooksByText).not.toHaveBeenCalled();
    expect(mocks.searchOpenLibraryByText).not.toHaveBeenCalled();
  });

  it('uses external providers only after a local miss and reports partial provider failures', async () => {
    setupProvider();
    const suggestion = {
      provider: 'GOOGLE_BOOKS',
      externalId: 'volume-1',
      title: 'The Long Road',
      subtitle: null,
      authors: ['Jane Example'],
      publisher: 'North Press',
      publicationYear: 2020,
      description: null,
      language: 'en',
      pageCount: 200,
      coverUrl: null,
      isbn13: '9780306406157',
      isbn10: '0306406152',
      confidence: 0.8,
    };
    mocks.searchGoogleBooksByText.mockResolvedValue([suggestion]);
    mocks.searchOpenLibraryByText.mockRejectedValue(new Error('provider unavailable'));

    const result = await searchCoverImage(Buffer.from('image'), 'jpeg', 'user-1');

    expect(mocks.searchGoogleBooksByText).toHaveBeenCalledOnce();
    expect(mocks.searchOpenLibraryByText).toHaveBeenCalledOnce();
    expect(result.suggestions).toEqual([suggestion]);
    expect(result.providerErrors).toEqual(['Open Library']);
  });

  it('reads full text and averages word confidence from the Vision response', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          responses: [
            {
              fullTextAnnotation: {
                text: 'Recognized title',
                pages: [
                  {
                    blocks: [{ paragraphs: [{ words: [{ confidence: 0.8 }, { confidence: 1 }] }] }],
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await new GoogleVisionOcrProvider('test-key').extract(
      Buffer.from('image'),
      'jpeg',
    );

    expect(result).toEqual({
      provider: 'GOOGLE_CLOUD_VISION',
      text: 'Recognized title',
      confidence: 0.9,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('rejects unsuccessful Vision responses so the API can return a retryable error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    await expect(
      new GoogleVisionOcrProvider('test-key').extract(Buffer.from('image'), 'jpeg'),
    ).rejects.toThrow('HTTP 503');
  });
});

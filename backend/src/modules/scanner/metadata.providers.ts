import { normalizeIsbn } from '../../lib/isbn.js';

export interface MetadataSuggestion {
  provider: 'GOOGLE_BOOKS' | 'OPEN_LIBRARY';
  externalId: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  publicationYear: number | null;
  description: string | null;
  language: string | null;
  pageCount: number | null;
  coverUrl: string | null;
  isbn13: string | null;
  isbn10: string | null;
  confidence: number;
}

const MAX_DESCRIPTION_LENGTH = 4000;
const safeString = (value: unknown, max = 500): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized ? normalized.slice(0, max) : null;
};

function yearFrom(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/\b(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/);
  return match ? Number(match[1]) : null;
}

function normalizeProviderIsbns(values: unknown): { isbn13: string | null; isbn10: string | null } {
  if (!Array.isArray(values)) return { isbn13: null, isbn10: null };
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const isbn = normalizeIsbn(value);
    if (isbn) return { isbn13: isbn.isbn13, isbn10: isbn.isbn10 };
  }
  return { isbn13: null, isbn10: null };
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Metadata provider returned HTTP ${response.status}`);
  return response.json();
}

export async function searchGoogleBooks(isbn13: string): Promise<MetadataSuggestion[]> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(`isbn:${isbn13}`)}&maxResults=5`;
  const payload = (await getJson(url)) as {
    items?: {
      id?: string;
      volumeInfo?: {
        title?: unknown;
        subtitle?: unknown;
        authors?: unknown;
        publisher?: unknown;
        publishedDate?: unknown;
        description?: unknown;
        language?: unknown;
        pageCount?: unknown;
        industryIdentifiers?: { type?: string; identifier?: string }[];
        imageLinks?: { thumbnail?: string; smallThumbnail?: string };
      };
    }[];
  };
  return (payload.items ?? []).flatMap((item) => {
    const info = item.volumeInfo;
    const title = safeString(info?.title, 300);
    if (!title || !item.id) return [];
    const identifiers = (info?.industryIdentifiers ?? []).map(
      (identifier) => identifier.identifier,
    );
    const normalized = normalizeProviderIsbns(identifiers);
    const authors = Array.isArray(info?.authors)
      ? info.authors.flatMap((author) => {
          const name = safeString(author, 200);
          return name ? [name] : [];
        })
      : [];
    const description = safeString(info?.description, MAX_DESCRIPTION_LENGTH);
    return [
      {
        provider: 'GOOGLE_BOOKS' as const,
        externalId: item.id,
        title,
        subtitle: safeString(info?.subtitle, 300),
        authors,
        publisher: safeString(info?.publisher, 200),
        publicationYear: yearFrom(info?.publishedDate),
        description,
        language: safeString(info?.language, 40),
        pageCount:
          typeof info?.pageCount === 'number' && info.pageCount > 0
            ? Math.floor(info.pageCount)
            : null,
        coverUrl: safeString(info?.imageLinks?.thumbnail ?? info?.imageLinks?.smallThumbnail, 1000),
        ...normalized,
        confidence: normalized.isbn13 === isbn13 ? 0.96 : 0.72,
      },
    ];
  });
}

export async function searchOpenLibrary(isbn13: string): Promise<MetadataSuggestion[]> {
  const url = `https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn13)}&limit=5`;
  const payload = (await getJson(url)) as {
    docs?: {
      key?: string;
      title?: unknown;
      subtitle?: unknown;
      author_name?: unknown;
      publisher?: unknown;
      first_publish_year?: unknown;
      isbn?: unknown;
      number_of_pages_median?: unknown;
      cover_i?: unknown;
      language?: unknown;
    }[];
  };
  return (payload.docs ?? []).flatMap((doc) => {
    const title = safeString(doc.title, 300);
    if (!title || !doc.key) return [];
    const normalized = normalizeProviderIsbns(doc.isbn);
    const authors = Array.isArray(doc.author_name)
      ? doc.author_name.flatMap((author) => {
          const name = safeString(author, 200);
          return name ? [name] : [];
        })
      : [];
    return [
      {
        provider: 'OPEN_LIBRARY' as const,
        externalId: doc.key,
        title,
        subtitle: safeString(doc.subtitle, 300),
        authors,
        publisher: Array.isArray(doc.publisher) ? safeString(doc.publisher[0], 200) : null,
        publicationYear: typeof doc.first_publish_year === 'number' ? doc.first_publish_year : null,
        description: null,
        language: Array.isArray(doc.language) ? safeString(doc.language[0], 40) : null,
        pageCount:
          typeof doc.number_of_pages_median === 'number' ? doc.number_of_pages_median : null,
        coverUrl:
          typeof doc.cover_i === 'number'
            ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
            : null,
        ...normalized,
        confidence: normalized.isbn13 === isbn13 ? 0.9 : 0.68,
      },
    ];
  });
}

export async function searchGoogleBooksByText(query: string): Promise<MetadataSuggestion[]> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`;
  const payload = (await getJson(url)) as {
    items?: {
      id?: string;
      volumeInfo?: {
        title?: unknown;
        subtitle?: unknown;
        authors?: unknown;
        publisher?: unknown;
        publishedDate?: unknown;
        description?: unknown;
        language?: unknown;
        pageCount?: unknown;
        industryIdentifiers?: { type?: string; identifier?: string }[];
        imageLinks?: { thumbnail?: string; smallThumbnail?: string };
      };
    }[];
  };
  return (payload.items ?? []).flatMap((item) => {
    const info = item.volumeInfo;
    const title = safeString(info?.title, 300);
    if (!title || !item.id) return [];
    const normalized = normalizeProviderIsbns(
      (info?.industryIdentifiers ?? []).map((identifier) => identifier.identifier),
    );
    const authors = Array.isArray(info?.authors)
      ? info.authors.flatMap((author) => {
          const value = safeString(author, 200);
          return value ? [value] : [];
        })
      : [];
    return [
      {
        provider: 'GOOGLE_BOOKS' as const,
        externalId: item.id,
        title,
        subtitle: safeString(info?.subtitle, 300),
        authors,
        publisher: safeString(info?.publisher, 200),
        publicationYear: yearFrom(info?.publishedDate),
        description: safeString(info?.description, MAX_DESCRIPTION_LENGTH),
        language: safeString(info?.language, 40),
        pageCount:
          typeof info?.pageCount === 'number' && info.pageCount > 0
            ? Math.floor(info.pageCount)
            : null,
        coverUrl: safeString(info?.imageLinks?.thumbnail ?? info?.imageLinks?.smallThumbnail, 1000),
        ...normalized,
        confidence: 0.62,
      },
    ];
  });
}

export async function searchOpenLibraryByText(query: string): Promise<MetadataSuggestion[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`;
  const payload = (await getJson(url)) as {
    docs?: {
      key?: string;
      title?: unknown;
      subtitle?: unknown;
      author_name?: unknown;
      publisher?: unknown;
      first_publish_year?: unknown;
      isbn?: unknown;
      number_of_pages_median?: unknown;
      cover_i?: unknown;
      language?: unknown;
    }[];
  };
  return (payload.docs ?? []).flatMap((doc) => {
    const title = safeString(doc.title, 300);
    if (!title || !doc.key) return [];
    const normalized = normalizeProviderIsbns(doc.isbn);
    const authors = Array.isArray(doc.author_name)
      ? doc.author_name.flatMap((author) => {
          const value = safeString(author, 200);
          return value ? [value] : [];
        })
      : [];
    return [
      {
        provider: 'OPEN_LIBRARY' as const,
        externalId: doc.key,
        title,
        subtitle: safeString(doc.subtitle, 300),
        authors,
        publisher: Array.isArray(doc.publisher) ? safeString(doc.publisher[0], 200) : null,
        publicationYear: typeof doc.first_publish_year === 'number' ? doc.first_publish_year : null,
        description: null,
        language: Array.isArray(doc.language) ? safeString(doc.language[0], 40) : null,
        pageCount:
          typeof doc.number_of_pages_median === 'number' ? doc.number_of_pages_median : null,
        coverUrl:
          typeof doc.cover_i === 'number'
            ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
            : null,
        ...normalized,
        confidence: 0.55,
      },
    ];
  });
}

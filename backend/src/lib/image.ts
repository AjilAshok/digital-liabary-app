/** Image types accepted for book covers. */
export type CoverImageType = 'jpeg' | 'png' | 'webp';

export const COVER_EXTENSIONS: Record<CoverImageType, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
};
export const COVER_MIME: Record<CoverImageType, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Detects the image type from the file's leading bytes ("magic numbers"). The declared MIME type
 * and file name are never trusted. Returns null for anything that is not JPEG, PNG or WebP.
 */
export function detectImageType(buf: Uint8Array): CoverImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    buf.length >= 12 &&
    String.fromCharCode(...buf.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...buf.subarray(8, 12)) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

import { getEnv } from '../../config/env.js';
import type { CoverImageType } from '../../lib/image.js';

export interface OcrExtraction {
  provider: string;
  text: string;
  confidence: number | null;
}

export interface OcrProvider {
  readonly name: string;
  extract(image: Buffer, imageType: CoverImageType): Promise<OcrExtraction>;
}

export class GoogleVisionOcrProvider implements OcrProvider {
  readonly name = 'GOOGLE_CLOUD_VISION';

  constructor(private readonly apiKey: string) {}

  async extract(image: Buffer, _imageType: CoverImageType): Promise<OcrExtraction> {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: image.toString('base64') },
              features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
              imageContext: { languageHints: ['en'] },
            },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) throw new Error(`OCR provider returned HTTP ${response.status}`);
    const payload = (await response.json()) as {
      responses?: {
        error?: { message?: string };
        fullTextAnnotation?: {
          text?: string;
          pages?: { blocks?: { paragraphs?: { words?: { confidence?: number }[] }[] }[] }[];
        };
        textAnnotations?: { description?: string }[];
      }[];
    };
    const result = payload.responses?.[0];
    if (result?.error) throw new Error(result.error.message ?? 'OCR provider rejected the image');
    const text =
      result?.fullTextAnnotation?.text ?? result?.textAnnotations?.[0]?.description ?? '';
    const wordScores =
      result?.fullTextAnnotation?.pages?.flatMap(
        (page) =>
          page.blocks?.flatMap(
            (block) =>
              block.paragraphs?.flatMap(
                (paragraph) =>
                  paragraph.words?.flatMap((word) =>
                    typeof word.confidence === 'number' ? [word.confidence] : [],
                  ) ?? [],
              ) ?? [],
          ) ?? [],
      ) ?? [];
    const confidence = wordScores.length
      ? wordScores.reduce((sum, score) => sum + score, 0) / wordScores.length
      : null;
    return { provider: this.name, text: text.slice(0, 20_000), confidence };
  }
}

export function getOcrProvider(): OcrProvider | null {
  const env = getEnv();
  if (env.OCR_PROVIDER === 'disabled') return null;
  if (!env.GOOGLE_CLOUD_VISION_API_KEY || env.GOOGLE_CLOUD_VISION_API_KEY.startsWith('CHANGE_ME')) {
    return null;
  }
  return new GoogleVisionOcrProvider(env.GOOGLE_CLOUD_VISION_API_KEY);
}

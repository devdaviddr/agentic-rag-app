import { generateText } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { normalizeOllamaBaseURL } from './embeddings.js';
import {
  OCR_PROMPT,
  FIGURE_DETECT_PROMPT,
  FIGURE_SUMMARY_PROMPT,
} from './prompts.js';

export interface VisionClientOptions {
  baseUrl: string;
  model: string;
}

export interface VisionClient {
  // Use a permissive type — ollama-ai-provider's chat-model type is internal.
  // The shape we need is `model: <usable as ai-sdk model>`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
}

export function createVisionClient(opts: VisionClientOptions): VisionClient {
  const ollama = createOllama({ baseURL: normalizeOllamaBaseURL(opts.baseUrl) });
  return { model: ollama(opts.model) };
}

export interface DetectedFigure {
  label: string;
  bbox: [number, number, number, number];
  caption: string;
}

/** OCR a page raster into clean Markdown. */
export async function ocrPage(client: VisionClient, png: Buffer): Promise<string> {
  const { text } = await generateText({
    model: client.model,
    temperature: 0.1,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: OCR_PROMPT },
          { type: 'image', image: png },
        ],
      },
    ],
  });
  return text.trim();
}

/**
 * Detect figures (charts, diagrams, photos, screenshots) on a page raster.
 * Defensive JSON parse: if it's not valid JSON, scan for the first `[` and
 * last `]` substring; if that still won't parse, return [].
 */
export async function detectFigures(
  client: VisionClient,
  png: Buffer,
): Promise<DetectedFigure[]> {
  const { text } = await generateText({
    model: client.model,
    temperature: 0.1,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: FIGURE_DETECT_PROMPT },
          { type: 'image', image: png },
        ],
      },
    ],
  });
  const raw = text.trim();
  return parseFiguresJson(raw);
}

export function parseFiguresJson(raw: string): DetectedFigure[] {
  const tryParse = (s: string): DetectedFigure[] | null => {
    try {
      const parsed = JSON.parse(s);
      if (!Array.isArray(parsed)) return [];
      const out: DetectedFigure[] = [];
      for (const f of parsed) {
        if (
          f &&
          typeof f === 'object' &&
          typeof f.label === 'string' &&
          Array.isArray(f.bbox) &&
          f.bbox.length === 4 &&
          f.bbox.every((n: unknown) => typeof n === 'number')
        ) {
          out.push({
            label: f.label,
            bbox: [f.bbox[0], f.bbox[1], f.bbox[2], f.bbox[3]],
            caption: typeof f.caption === 'string' ? f.caption : '',
          });
        }
      }
      return out;
    } catch {
      return null;
    }
  };

  const direct = tryParse(raw);
  if (direct !== null) return direct;

  // Fallback: extract the largest `[ ... ]` substring.
  const first = raw.indexOf('[');
  const last = raw.lastIndexOf(']');
  if (first >= 0 && last > first) {
    const sliced = raw.slice(first, last + 1);
    const tryAgain = tryParse(sliced);
    if (tryAgain !== null) return tryAgain;
  }
  return [];
}

/** Summarize a single figure crop in 1–2 sentences. */
export async function summarizeFigure(
  client: VisionClient,
  png: Buffer,
): Promise<string> {
  const { text } = await generateText({
    model: client.model,
    temperature: 0.1,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: FIGURE_SUMMARY_PROMPT },
          { type: 'image', image: png },
        ],
      },
    ],
  });
  return text.trim();
}

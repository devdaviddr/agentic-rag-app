import './polyfills.js';
import { configureUnPDF, extractText, getDocumentProxy } from 'unpdf';

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
}

let pdfjsConfigured = false;

/**
 * unpdf@^1 separates the serverless build from the full pdfjs build.
 * `renderPageAsImage` (and other render-y bits) require the full build,
 * which we lazy-load on first use. Configure once per process.
 */
export async function ensurePdfjs(): Promise<void> {
  if (pdfjsConfigured) return;
  await configureUnPDF({ pdfjs: () => import('unpdf/pdfjs') });
  pdfjsConfigured = true;
}

/**
 * Extract plain text from a PDF buffer using unpdf (Mozilla pdf.js core).
 * Pages are joined with double newlines so the chunker treats them as
 * paragraph boundaries. Throws on encrypted / unreadable PDFs — callers
 * should map to a 4xx response.
 *
 * Note: image-only / scanned PDFs return empty or near-empty text; OCR is
 * out of scope for this fallback path — the vision pipeline owns that.
 */
export async function extractPdfText(input: Uint8Array | ArrayBuffer): Promise<PdfExtractionResult> {
  await ensurePdfjs();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const joined = Array.isArray(text) ? text.join('\n\n').trim() : String(text).trim();
  if (joined.length === 0) {
    throw new Error('PDF produced no extractable text (likely scanned/image-only).');
  }
  return { text: joined, pageCount: totalPages };
}

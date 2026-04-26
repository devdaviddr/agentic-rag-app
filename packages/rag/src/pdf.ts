import { extractText, getDocumentProxy } from 'unpdf';

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
}

/**
 * Extract plain text from a PDF buffer using unpdf (Mozilla pdf.js core).
 * Pages are joined with double newlines so the chunker treats them as
 * paragraph boundaries. Throws on encrypted / unreadable PDFs — callers
 * should map to a 4xx response.
 *
 * Note: image-only / scanned PDFs return empty or near-empty text; OCR is
 * out of scope for v1.
 */
export async function extractPdfText(input: Uint8Array | ArrayBuffer): Promise<PdfExtractionResult> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const joined = Array.isArray(text) ? text.join('\n\n').trim() : String(text).trim();
  if (joined.length === 0) {
    throw new Error('PDF produced no extractable text (likely scanned/image-only).');
  }
  return { text: joined, pageCount: totalPages };
}

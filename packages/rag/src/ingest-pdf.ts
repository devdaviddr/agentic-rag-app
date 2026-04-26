import './polyfills.js';
import { sql } from 'drizzle-orm';
import { getDb, schema, getDocumentBytes } from '@app/db';
import type { ResolvedSettings } from '@app/shared';
import { chunkText } from './chunker.js';
import type { Embedder } from './embeddings.js';
import { ensurePdfjs } from './pdf.js';
import { rasterizePage, resizeLongestEdge, cropByBbox, imageDims } from './raster.js';
import { createSemaphore } from './util/sema.js';
import {
  ocrPage,
  detectFigures,
  summarizeFigure,
  type VisionClient,
} from './vision.js';
import { extractText, getDocumentProxy } from 'unpdf';
import crypto from 'node:crypto';

const ASSET_RE = /asset:([0-9a-f-]{36})/gi;
const MAX_EDGE = 1792;

export interface RunIngestJobOpts {
  settings: ResolvedSettings;
  embedder: Embedder;
  vision: VisionClient;
  onProgress?: (pagesDone: number, pagesTotal: number) => Promise<void>;
}

interface PendingFigure {
  id: string;
  documentId: string;
  page: number;
  ordinal: number;
  bbox: [number, number, number, number];
  width: number;
  height: number;
  bytes: Buffer;
  summary: string;
}

interface PendingPageRaster {
  id: string;
  documentId: string;
  page: number;
  width: number;
  height: number;
  bytes: Buffer;
}

async function setStatus(
  documentId: string,
  patch: {
    status?: string;
    error?: string | null;
    pagesTotal?: number | null;
    pagesDone?: number;
    extractionMethod?: string;
  },
): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    UPDATE ${schema.documents}
    SET
      ${patch.status !== undefined ? sql`ingest_status = ${patch.status},` : sql``}
      ${patch.error !== undefined ? sql`ingest_error = ${patch.error},` : sql``}
      ${patch.pagesTotal !== undefined ? sql`pages_total = ${patch.pagesTotal},` : sql``}
      ${patch.pagesDone !== undefined ? sql`pages_done = ${patch.pagesDone},` : sql``}
      ${patch.extractionMethod !== undefined ? sql`extraction_method = ${patch.extractionMethod},` : sql``}
      id = id
    WHERE id = ${documentId}
  `);
}

/**
 * Vision-OCR PDF ingest. See spec §9.2. Performs page-level rasterize → OCR →
 * figure detect → crop+summary, then chunks the combined markdown, embeds,
 * and writes both chunks (with image_ids) and document_images.
 */
export async function runIngestJob(
  documentId: string,
  opts: RunIngestJobOpts,
): Promise<void> {
  const db = getDb();
  try {
    const doc = await getDocumentBytes(documentId);
    if (!doc) throw new Error(`Document ${documentId} not found or missing original bytes`);

    await setStatus(documentId, { status: 'rasterizing', error: null, pagesDone: 0 });

    await ensurePdfjs();
    // Stable canonical copy. Per-page raster calls allocate their own
    // copies (pdfjs detaches the underlying ArrayBuffer on each consume).
    const pdfBytes = new Uint8Array(doc.bytes.byteLength);
    pdfBytes.set(doc.bytes);
    // Pass a *fresh* copy to getDocumentProxy too so the canonical buffer
    // isn't detached.
    const probeBytes = new Uint8Array(pdfBytes.byteLength);
    probeBytes.set(pdfBytes);
    let pdf;
    try {
      pdf = await getDocumentProxy(probeBytes);
    } catch (err) {
      // D3a: classify bad/encrypted PDFs with a friendly message.
      const raw = err instanceof Error ? err.message : String(err);
      const friendly = /password|encrypt|invalid/i.test(raw)
        ? 'PDF is encrypted or unreadable'
        : raw;
      const wrapped = new Error(friendly);
      wrapped.cause = err;
      throw wrapped;
    }
    const pagesTotal = pdf.numPages;
    await setStatus(documentId, { pagesTotal });

    const sema = createSemaphore(2);
    const pageMarkdowns: string[] = new Array<string>(pagesTotal).fill('');
    const pageOffsets: Array<{ page: number; length: number }> = [];
    const pendingFigures: PendingFigure[] = [];
    const pendingPages: PendingPageRaster[] = [];
    let pagesDone = 0;
    let firstPageStarted = false;
    // D3c: track consecutive figure-detect parse-failures. After 3 in a row
    // the model is clearly not honoring the JSON contract; skip figure detect
    // for the rest of the doc (still OCR though).
    let figureDetectMalformedStreak = 0;
    let figureDetectDisabled = false;

    const work = Array.from({ length: pagesTotal }, (_, i) => i + 1).map(
      async (pageNum) => {
        const release = await sema.acquire();
        try {
          if (!firstPageStarted) {
            firstPageStarted = true;
            await setStatus(documentId, { status: 'ocr' });
          }

          const rawPng = await rasterizePage(pdfBytes, pageNum, 2.0);
          const pagePng = await resizeLongestEdge(rawPng, MAX_EDGE);
          const dims = await imageDims(pagePng);

          // OCR.
          let pageMd: string;
          try {
            pageMd = await ocrPage(opts.vision, pagePng);
          } catch (err) {
            console.error(`[ingest-pdf] OCR failed page ${pageNum}:`, err);
            pageMd = '';
          }

          // Figure detection (best-effort).
          let figs: Awaited<ReturnType<typeof detectFigures>> = [];
          if (!figureDetectDisabled) {
            try {
              figs = await detectFigures(opts.vision, pagePng);
              if (figs.length === 0) {
                // detectFigures swallows JSON parse failures and returns []. We
                // can't fully distinguish "no figures" from "malformed", so we
                // only count empty results as suspicious when several pages in
                // a row come back empty. This is loose but safe — if the doc
                // genuinely has no figures, we just skip a few cheap calls.
                figureDetectMalformedStreak++;
              } else {
                figureDetectMalformedStreak = 0;
              }
            } catch (err) {
              console.error(`[ingest-pdf] detectFigures failed page ${pageNum}:`, err);
              figureDetectMalformedStreak++;
            }
            if (figureDetectMalformedStreak >= 3 && pagesTotal > 5) {
              console.warn(
                `[ingest-pdf] figure-detect produced ${figureDetectMalformedStreak} empty/failed pages in a row; disabling for the rest of doc ${documentId}`,
              );
              figureDetectDisabled = true;
            }
          }

          // Crop + summarize each figure (best-effort, sequential per page).
          const figureBlocks: string[] = [];
          for (let i = 0; i < figs.length; i++) {
            const f = figs[i]!;
            try {
              const { buf: cropBuf, width: cropW, height: cropH } = await cropByBbox(
                pagePng,
                f.bbox,
                0.03,
              );
              let summary = '';
              try {
                summary = await summarizeFigure(opts.vision, cropBuf);
              } catch (err) {
                console.error(`[ingest-pdf] summarizeFigure failed page ${pageNum} fig ${i}:`, err);
              }
              const id = crypto.randomUUID();
              pendingFigures.push({
                id,
                documentId,
                page: pageNum,
                ordinal: i + 1,
                bbox: f.bbox,
                width: cropW,
                height: cropH,
                bytes: cropBuf,
                summary,
              });
              figureBlocks.push(
                `\n\n![${f.label}](asset:${id})\n\n*${(f.caption || '').replace(/\s+/g, ' ').trim()}*\n\n`,
              );
            } catch (err) {
              console.error(`[ingest-pdf] crop failed page ${pageNum} fig ${i}:`, err);
            }
          }

          const fullPageMd = `${pageMd}${figureBlocks.join('')}`.trim();
          pageMarkdowns[pageNum - 1] = fullPageMd;

          // Stash the page raster row for kind='page'.
          pendingPages.push({
            id: crypto.randomUUID(),
            documentId,
            page: pageNum,
            width: dims.width,
            height: dims.height,
            bytes: pagePng,
          });

          pagesDone++;
          await setStatus(documentId, { pagesDone });
          if (opts.onProgress) await opts.onProgress(pagesDone, pagesTotal);
        } finally {
          release();
        }
      },
    );
    await Promise.all(work);

    // Build the combined markdown. Track per-page offsets so we can map
    // chunk offsets → source page later.
    const sep = '\n\n---\n\n';
    let combined = '';
    for (let i = 0; i < pageMarkdowns.length; i++) {
      const md = pageMarkdowns[i] ?? '';
      pageOffsets.push({ page: i + 1, length: md.length + (i > 0 ? sep.length : 0) });
      if (i > 0) combined += sep;
      combined += md;
    }

    if (combined.trim().length === 0) {
      throw new Error('Vision OCR produced no markdown across all pages');
    }

    await setStatus(documentId, { status: 'embedding' });

    // Insert pending document_images: pages first, then figures.
    if (pendingPages.length > 0 || pendingFigures.length > 0) {
      await db.transaction(async (tx) => {
        if (pendingPages.length > 0) {
          await tx.insert(schema.documentImages).values(
            pendingPages.map((p) => ({
              id: p.id,
              documentId: p.documentId,
              page: p.page,
              ordinal: 0,
              kind: 'page',
              mimeType: 'image/png',
              width: p.width,
              height: p.height,
              bbox: null,
              bytes: p.bytes,
              summary: null,
            })),
          );
        }
        if (pendingFigures.length > 0) {
          await tx.insert(schema.documentImages).values(
            pendingFigures.map((f) => ({
              id: f.id,
              documentId: f.documentId,
              page: f.page,
              ordinal: f.ordinal,
              kind: 'figure',
              mimeType: 'image/png',
              width: f.width,
              height: f.height,
              bbox: f.bbox,
              bytes: f.bytes,
              summary: f.summary || null,
            })),
          );
        }
      });
    }

    // Chunk the combined markdown.
    const pieces = chunkText(combined, {
      chunkSize: opts.settings.ragChunkSize,
      chunkOverlap: opts.settings.ragChunkOverlap,
    });
    if (pieces.length === 0) {
      throw new Error('Chunker produced 0 chunks from combined markdown');
    }

    // Map each chunk to its source page using `pageOffsets` and the chunk's
    // first occurrence in the combined string.
    let cursor = 0;
    const chunkPages: number[] = [];
    for (const piece of pieces) {
      const idx = combined.indexOf(piece, cursor);
      const startedAt = idx >= 0 ? idx : cursor;
      cursor = startedAt + piece.length;
      chunkPages.push(pageFromOffset(startedAt, pageOffsets));
    }

    // Extract image_ids per chunk.
    const chunkImageIds: string[][] = pieces.map((p) => {
      const ids = new Set<string>();
      let m: RegExpExecArray | null;
      ASSET_RE.lastIndex = 0;
      while ((m = ASSET_RE.exec(p))) ids.add(m[1]!.toLowerCase());
      return [...ids];
    });

    // Embed and persist chunks.
    const embeddings = await opts.embedder.embedBatch(pieces);
    await db.insert(schema.chunks).values(
      pieces.map((content, i) => ({
        documentId,
        ordinal: i,
        content,
        tokens: null,
        embedding: embeddings[i] ?? null,
        imageIds: chunkImageIds[i] ?? [],
        page: chunkPages[i] ?? null,
        metadata: {},
      })),
    );

    // Embed figure summaries (one batch).
    const figuresWithSummary = pendingFigures.filter((f) => f.summary && f.summary.length > 0);
    if (figuresWithSummary.length > 0) {
      const sumEmbeddings = await opts.embedder.embedBatch(
        figuresWithSummary.map((f) => f.summary),
      );
      for (let i = 0; i < figuresWithSummary.length; i++) {
        const f = figuresWithSummary[i]!;
        const vec = sumEmbeddings[i];
        if (!vec) continue;
        const vecLit = `[${vec.join(',')}]`;
        await db.execute(sql`
          UPDATE ${schema.documentImages}
          SET summary_embedding = ${vecLit}::vector
          WHERE id = ${f.id}
        `);
      }
    }

    await setStatus(documentId, {
      status: 'ready',
      extractionMethod: 'vision',
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ingest-pdf] job failed for ${documentId}:`, err);
    try {
      await setStatus(documentId, { status: 'failed', error: message });
    } catch (e) {
      console.error(`[ingest-pdf] failed to record failure status:`, e);
    }
    throw err;
  }
}

function pageFromOffset(
  offset: number,
  pageOffsets: Array<{ page: number; length: number }>,
): number {
  let acc = 0;
  for (const p of pageOffsets) {
    acc += p.length;
    if (offset < acc) return p.page;
  }
  return pageOffsets[pageOffsets.length - 1]?.page ?? 1;
}

/**
 * Text-only fallback when the vision pipeline can't run end-to-end (vision
 * model unavailable, all-pages OCR failed, etc.). Mirrors the legacy unpdf
 * extractText path but does not insert chunks itself — the caller does.
 */
export async function fallbackExtractText(pdfBytes: Uint8Array): Promise<{
  text: string;
  pageCount: number;
}> {
  await ensurePdfjs();
  const pdf = await getDocumentProxy(pdfBytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const joined = Array.isArray(text) ? text.join('\n\n').trim() : String(text).trim();
  return { text: joined, pageCount: totalPages };
}

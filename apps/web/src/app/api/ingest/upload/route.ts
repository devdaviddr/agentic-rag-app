import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { extractPdfText, ingestDocument, runIngestJob, createVisionClient } from '@app/rag';
import { getDb, schema } from '@app/db';
import { getEnv } from '@/lib/env';
import { getEmbedder } from '@/lib/embedder';
import { getSettings } from '@/lib/settings';
import { logIngest } from '@/lib/telemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

type Kind = 'text' | 'pdf';

function detectKind(filename: string, mime: string): Kind | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  if (
    lower.endsWith('.txt') ||
    lower.endsWith('.md') ||
    lower.endsWith('.markdown') ||
    mime.startsWith('text/')
  ) {
    return 'text';
  }
  return null;
}

function resolveMime(kind: Kind, providedMime: string, filename: string): string {
  if (providedMime && providedMime !== 'application/octet-stream') return providedMime;
  if (kind === 'pdf') return 'application/pdf';
  if (filename.toLowerCase().endsWith('.md') || filename.toLowerCase().endsWith('.markdown')) {
    return 'text/markdown';
  }
  return 'text/plain';
}

/**
 * In-process per-document mutex (D1). Two parallel uploads of the same file
 * (e.g. double-click) must not race the ingest job. Fingerprint:
 *   sha256(filename + size + first-1KB-bytes)
 * Lives on `globalThis` so it survives Next dev hot-reload of the route module.
 */
function inflightSet(): Set<string> {
  const g = globalThis as unknown as { __rag_inflight?: Set<string> };
  if (!g.__rag_inflight) g.__rag_inflight = new Set<string>();
  return g.__rag_inflight;
}

function fingerprintBytes(filename: string, bytes: Uint8Array): string {
  const h = crypto.createHash('sha256');
  h.update(filename);
  h.update(`:${bytes.byteLength}:`);
  // First 1 KB is enough to distinguish near-duplicates without re-hashing the
  // whole file on every upload.
  h.update(bytes.subarray(0, Math.min(1024, bytes.byteLength)));
  return h.digest('hex');
}

/** Map a vision-call error onto a "model not pulled" detection. */
function isModelNotPulled(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /model\s+'?[^']+'?\s+not\s+found|model not found|not\s+pulled|404/i.test(msg);
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing `file` field' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${file.size} > ${MAX_BYTES} bytes)` },
      { status: 413 },
    );
  }

  const kind = detectKind(file.name, file.type);
  if (!kind) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.name} (${file.type || 'unknown'}). Allowed: .txt, .md, .pdf` },
      { status: 415 },
    );
  }

  const rawBytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = resolveMime(kind, file.type, file.name);

  const titleField = form.get('title');
  const title =
    typeof titleField === 'string' && titleField.trim().length > 0 ? titleField.trim() : file.name;

  // ── PDF path: insert row synchronously, kick off async vision-OCR job ──
  if (kind === 'pdf') {
    // D1: per-document mutex. Reserve the fingerprint *before* any await so
    // two parallel requests can't both pass the `has()` check before either
    // has called `add()`. The check-and-add must be atomic with respect to
    // the JS event loop. Released in `finally` after `runIngestJob` resolves.
    const fingerprint = fingerprintBytes(file.name, rawBytes);
    const inflight = inflightSet();
    if (inflight.has(fingerprint)) {
      logIngest({
        event: 'duplicate_in_flight',
        documentId: '(unassigned)',
        fingerprint,
        source: file.name,
      });
      return NextResponse.json(
        {
          error: 'duplicate_in_flight',
          message: 'This file is already being ingested. Wait for it to finish or refresh the page.',
        },
        { status: 409 },
      );
    }
    inflight.add(fingerprint);

    let documentId: string | undefined;
    try {
      const db = getDb();
      const original = Buffer.from(rawBytes);
      const inserted = await db.execute<{ id: string }>(sql`
        INSERT INTO ${schema.documents}
          (source, title, mime_type, bytes, original_content, metadata, ingest_status, pages_done)
        VALUES
          (
            ${file.name},
            ${title},
            ${mimeType},
            ${file.size},
            ${original},
            ${JSON.stringify({ filename: file.name, mimeType, bytes: file.size })}::jsonb,
            'queued',
            0
          )
        RETURNING id
      `);
      documentId = inserted[0]?.id;
      if (!documentId) {
        inflight.delete(fingerprint);
        return NextResponse.json({ error: 'Failed to insert document' }, { status: 500 });
      }
    } catch (err) {
      // Insert failed → release the lock and surface the error.
      inflight.delete(fingerprint);
      throw err;
    }

    logIngest({
      event: 'queued',
      documentId,
      source: file.name,
      bytes: file.size,
      fingerprint,
    });

    after(async () => {
      try {
        const settings = await getSettings();
        const embedder = getEmbedder();
        const vision = createVisionClient({
          baseUrl: settings.ollamaBaseUrl,
          model: settings.visionModel,
        });
        logIngest({
          event: 'job_start',
          documentId,
          visionModel: settings.visionModel,
          embedModel: settings.embedModel,
        });
        await runIngestJob(documentId, {
          settings,
          embedder,
          vision,
          onProgress: async (pagesDone, pagesTotal) => {
            logIngest({ event: 'page_done', documentId, pagesDone, pagesTotal });
          },
        });
        logIngest({ event: 'job_success', documentId });
      } catch (err) {
        // Vision job already records 'failed' on error, but surface a fallback
        // attempt to text extraction if no chunks landed yet.
        console.error(`[ingest/upload] vision job error for ${documentId}:`, err);
        const visionMissing = isModelNotPulled(err);
        logIngest({
          event: 'job_error',
          documentId,
          message: err instanceof Error ? err.message : String(err),
          visionMissing,
        });

        try {
          const db2 = getDb();
          const rows = await db2.execute<{ count: number }>(sql`
            SELECT COUNT(*)::int AS count FROM ${schema.chunks} WHERE document_id = ${documentId}
          `);
          const chunkCount = rows[0]?.count ?? 0;
          if (chunkCount === 0) {
            logIngest({ event: 'fallback_text_extract', documentId });
            const { text, pageCount } = await extractPdfText(rawBytes);
            const env = getEnv();
            const settings = await getSettings();
            const embedder = getEmbedder();
            const { chunkText } = await import('@app/rag');
            const pieces = chunkText(text, {
              chunkSize: settings.ragChunkSize,
              chunkOverlap: settings.ragChunkOverlap,
            });
            if (pieces.length > 0) {
              const embeddings = await embedder.embedBatch(pieces);
              await db2.insert(schema.chunks).values(
                pieces.map((content, i) => ({
                  documentId,
                  ordinal: i,
                  content,
                  tokens: null,
                  embedding: embeddings[i] ?? null,
                  metadata: { pageCount },
                })),
              );
              // D3b: when vision is missing, leave a clear hint in ingest_error
              // for the UI even though we recover to 'ready' with text path.
              const errMsg = visionMissing
                ? `Vision model '${settings.visionModel}' not pulled. Run: ollama pull ${settings.visionModel} (text-extraction fallback used)`
                : null;
              await db2.execute(sql`
                UPDATE ${schema.documents}
                SET ingest_status = 'ready',
                    extraction_method = 'text',
                    ingest_error = ${errMsg},
                    pages_done = ${pageCount},
                    pages_total = COALESCE(pages_total, ${pageCount})
                WHERE id = ${documentId}
              `);
              logIngest({
                event: 'fallback_text_extract_ready',
                documentId,
                chunks: pieces.length,
                pageCount,
              });
            }
            void env;
          }
        } catch (fallbackErr) {
          console.error(`[ingest/upload] fallback failed for ${documentId}:`, fallbackErr);
          logIngest({
            event: 'fallback_failed',
            documentId,
            message: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
          });
        }
      } finally {
        inflight.delete(fingerprint);
      }
    });

    return NextResponse.json(
      { documentId, kind: 'pdf', queued: true, source: file.name, bytes: file.size },
      { status: 202 },
    );
  }

  // ── Text path: synchronous, unchanged behavior ──
  const content = new TextDecoder('utf-8', { fatal: false }).decode(rawBytes).trim();
  if (content.length === 0) {
    return NextResponse.json({ error: 'File contains no text' }, { status: 400 });
  }

  const env = getEnv();
  const embedder = getEmbedder();
  const result = await ingestDocument(
    {
      source: file.name,
      title,
      content,
      metadata: { filename: file.name, mimeType, bytes: file.size },
    },
    {
      chunkSize: env.RAG_CHUNK_SIZE,
      chunkOverlap: env.RAG_CHUNK_OVERLAP,
      embedder,
    },
    {
      originalBytes: rawBytes,
      mimeType,
      bytes: file.size,
    },
  );

  // Mark text docs as ready (ingestDocument left status='queued' default).
  const db = getDb();
  await db.execute(sql`
    UPDATE ${schema.documents}
    SET ingest_status = 'ready', extraction_method = 'text'
    WHERE id = ${result.documentId}
  `);

  return NextResponse.json(
    { ...result, source: file.name, kind, bytes: file.size },
    { status: 201 },
  );
}

import { sql } from 'drizzle-orm';
import { getDb, schema } from '@app/db';
import type { IngestRequest } from '@app/shared';
import { chunkText } from './chunker.js';
import type { Embedder } from './embeddings.js';

export interface IngestOptions {
  chunkSize: number;
  chunkOverlap: number;
  embedder: Embedder;
}

export interface IngestExtras {
  /** Original file bytes to retain in `documents.original_content`. */
  originalBytes?: Buffer | Uint8Array;
  mimeType?: string;
  /** Byte size for display; falls back to originalBytes.length. */
  bytes?: number;
}

export interface IngestResult {
  documentId: string;
  chunkCount: number;
}

export async function ingestDocument(
  req: IngestRequest,
  opts: IngestOptions,
  extras: IngestExtras = {},
): Promise<IngestResult> {
  const db = getDb();
  const pieces = chunkText(req.content, {
    chunkSize: opts.chunkSize,
    chunkOverlap: opts.chunkOverlap,
  });
  if (pieces.length === 0) {
    throw new Error('Document produced zero chunks.');
  }

  const embeddings = await opts.embedder.embedBatch(pieces);

  const original =
    extras.originalBytes !== undefined
      ? Buffer.isBuffer(extras.originalBytes)
        ? extras.originalBytes
        : Buffer.from(extras.originalBytes)
      : null;
  const byteCount = extras.bytes ?? original?.byteLength ?? null;

  return await db.transaction(async (tx) => {
    // Insert via raw `sql` to keep the Buffer on the binary path. Drizzle's
    // `.values()` mangles bytea columns even with a customType `toDriver`,
    // producing a 0-byte stored value.
    const inserted = await tx.execute<{ id: string }>(sql`
      INSERT INTO ${schema.documents}
        (source, title, mime_type, bytes, original_content, metadata)
      VALUES
        (
          ${req.source},
          ${req.title ?? null},
          ${extras.mimeType ?? null},
          ${byteCount},
          ${original},
          ${JSON.stringify(req.metadata ?? {})}::jsonb
        )
      RETURNING id
    `);
    const doc = inserted[0];
    if (!doc) throw new Error('Failed to insert document.');

    await tx.insert(schema.chunks).values(
      pieces.map((content, i) => ({
        documentId: doc.id,
        ordinal: i,
        content,
        tokens: null,
        embedding: embeddings[i] ?? null,
        metadata: {},
      })),
    );

    return { documentId: doc.id, chunkCount: pieces.length };
  });
}

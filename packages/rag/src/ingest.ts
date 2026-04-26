import { getDb, schema } from '@app/db';
import type { IngestRequest } from '@app/shared';
import { chunkText } from './chunker.js';
import type { Embedder } from './embeddings.js';

export interface IngestOptions {
  chunkSize: number;
  chunkOverlap: number;
  embedder: Embedder;
}

export interface IngestResult {
  documentId: string;
  chunkCount: number;
}

export async function ingestDocument(
  req: IngestRequest,
  opts: IngestOptions,
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

  return await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(schema.documents)
      .values({
        source: req.source,
        title: req.title ?? null,
        metadata: req.metadata ?? {},
      })
      .returning({ id: schema.documents.id });

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

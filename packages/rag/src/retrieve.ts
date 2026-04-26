import { sql } from 'drizzle-orm';
import { getDb, schema } from '@app/db';
import type { RetrievalResult } from '@app/shared';
import type { Embedder } from './embeddings.js';

export interface RetrieveOptions {
  topK: number;
  embedder: Embedder;
  /** Optional source filter (substring match on documents.source). */
  sourceFilter?: string;
}

/**
 * Cosine-distance ANN search over chunks.embedding (HNSW index).
 * Returns top-k chunks joined with their parent document metadata.
 */
export async function retrieve(
  query: string,
  opts: RetrieveOptions,
): Promise<RetrievalResult[]> {
  const db = getDb();
  const queryVec = await opts.embedder.embedOne(query);
  const vecLiteral = `[${queryVec.join(',')}]`;

  const rows = await db.execute<{
    chunk_id: string;
    document_id: string;
    content: string;
    score: number;
    source: string;
    title: string | null;
  }>(sql`
    SELECT
      c.id            AS chunk_id,
      c.document_id   AS document_id,
      c.content       AS content,
      1 - (c.embedding <=> ${vecLiteral}::vector) AS score,
      d.source        AS source,
      d.title         AS title
    FROM ${schema.chunks} c
    JOIN ${schema.documents} d ON d.id = c.document_id
    WHERE c.embedding IS NOT NULL
      ${opts.sourceFilter ? sql`AND d.source ILIKE ${'%' + opts.sourceFilter + '%'}` : sql``}
    ORDER BY c.embedding <=> ${vecLiteral}::vector
    LIMIT ${opts.topK}
  `);

  return rows.map((r) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    content: r.content,
    score: Number(r.score),
    source: r.source,
    title: r.title,
  }));
}

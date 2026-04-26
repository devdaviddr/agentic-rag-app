import { sql } from 'drizzle-orm';
import { getDb, schema } from '@app/db';
import type { Embedder } from './embeddings.js';

export interface FigureHit {
  id: string;
  documentId: string;
  source: string;
  title: string | null;
  page: number;
  summary: string;
  score: number;
}

export interface RetrieveFiguresOptions {
  topK?: number;
  embedder: Embedder;
  sourceFilter?: string;
}

/**
 * Direct figure retrieval — semantic search over `document_images.summary_embedding`
 * (kind='figure' rows that have a summary embedded). Used by the agent's
 * `find_figure` tool and by the chat post-processor (Phase C).
 */
export async function retrieveFigures(
  query: string,
  opts: RetrieveFiguresOptions,
): Promise<FigureHit[]> {
  const db = getDb();
  const topK = opts.topK ?? 4;
  const queryVec = await opts.embedder.embedOne(query);
  const vecLiteral = `[${queryVec.join(',')}]`;

  const rows = await db.execute<{
    id: string;
    document_id: string;
    source: string;
    title: string | null;
    page: number;
    summary: string | null;
    score: number;
  }>(sql`
    SELECT
      i.id            AS id,
      i.document_id   AS document_id,
      d.source        AS source,
      d.title         AS title,
      i.page          AS page,
      i.summary       AS summary,
      1 - (i.summary_embedding <=> ${vecLiteral}::vector) AS score
    FROM ${schema.documentImages} i
    JOIN ${schema.documents} d ON d.id = i.document_id
    WHERE i.summary_embedding IS NOT NULL
      AND i.kind = 'figure'
      ${opts.sourceFilter ? sql`AND d.source ILIKE ${'%' + opts.sourceFilter + '%'}` : sql``}
    ORDER BY i.summary_embedding <=> ${vecLiteral}::vector
    LIMIT ${topK}
  `);

  return rows.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    source: r.source,
    title: r.title,
    page: r.page,
    summary: r.summary ?? '',
    score: Number(r.score),
  }));
}

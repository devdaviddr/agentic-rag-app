import { sql, inArray } from 'drizzle-orm';
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
 * Returns top-k chunks joined with their parent document metadata. If any
 * returned chunk has non-empty `image_ids`, a single bulk lookup of
 * `document_images` joins per-chunk `imageRefs[]`.
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
    image_ids: string[] | null;
  }>(sql`
    SELECT
      c.id            AS chunk_id,
      c.document_id   AS document_id,
      c.content       AS content,
      1 - (c.embedding <=> ${vecLiteral}::vector) AS score,
      d.source        AS source,
      d.title         AS title,
      c.image_ids     AS image_ids
    FROM ${schema.chunks} c
    JOIN ${schema.documents} d ON d.id = c.document_id
    WHERE c.embedding IS NOT NULL
      ${opts.sourceFilter ? sql`AND d.source ILIKE ${'%' + opts.sourceFilter + '%'}` : sql``}
    ORDER BY c.embedding <=> ${vecLiteral}::vector
    LIMIT ${opts.topK}
  `);

  // Collect every image_id referenced across the result set.
  const allImageIds = new Set<string>();
  for (const r of rows) {
    const ids = r.image_ids ?? [];
    for (const id of ids) allImageIds.add(id);
  }

  // Bulk lookup if any references exist.
  const imageMeta = new Map<string, { id: string; summary: string | null; page: number }>();
  if (allImageIds.size > 0) {
    const idList = [...allImageIds];
    const imgRows = await db
      .select({
        id: schema.documentImages.id,
        summary: schema.documentImages.summary,
        page: schema.documentImages.page,
      })
      .from(schema.documentImages)
      .where(inArray(schema.documentImages.id, idList));
    for (const ir of imgRows) {
      imageMeta.set(ir.id, { id: ir.id, summary: ir.summary, page: ir.page });
    }
  }

  return rows.map((r) => {
    const ids = r.image_ids ?? [];
    const refs = ids
      .map((id) => imageMeta.get(id))
      .filter((x): x is { id: string; summary: string | null; page: number } => Boolean(x));
    const out: RetrievalResult = {
      chunkId: r.chunk_id,
      documentId: r.document_id,
      content: r.content,
      score: Number(r.score),
      source: r.source,
      title: r.title,
    };
    if (refs.length > 0) out.imageRefs = refs;
    return out;
  });
}

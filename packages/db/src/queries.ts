import { eq, sql } from 'drizzle-orm';
import { getDb } from './client.js';
import { documents, chunks } from './schema.js';

/** Returns the deleted id, or null if no row matched. */
export async function deleteDocument(id: string): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .delete(documents)
    .where(eq(documents.id, id))
    .returning({ id: documents.id });
  return rows[0]?.id ?? null;
}

export interface DocumentListItem {
  id: string;
  source: string;
  title: string | null;
  chunkCount: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/** Lists every document with its chunk count, newest first. */
export async function listDocuments(limit = 200): Promise<DocumentListItem[]> {
  const db = getDb();
  const rows = await db.execute<{
    id: string;
    source: string;
    title: string | null;
    chunk_count: number;
    metadata: Record<string, unknown>;
    created_at: Date | string;
  }>(sql`
    SELECT
      d.id              AS id,
      d.source          AS source,
      d.title           AS title,
      COUNT(c.id)::int  AS chunk_count,
      d.metadata        AS metadata,
      d.created_at      AS created_at
    FROM ${documents} d
    LEFT JOIN ${chunks} c ON c.document_id = d.id
    GROUP BY d.id
    ORDER BY d.created_at DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    title: r.title,
    chunkCount: r.chunk_count,
    metadata: r.metadata,
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
  }));
}

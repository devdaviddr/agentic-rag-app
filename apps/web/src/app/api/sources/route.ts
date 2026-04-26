import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb, schema } from '@app/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const rows = await db.execute<{
    id: string;
    source: string;
    title: string | null;
    mime_type: string | null;
    bytes: number | null;
    has_original: boolean;
    chunk_count: number;
    metadata: Record<string, unknown>;
    created_at: Date | string;
    ingest_status: string;
    ingest_error: string | null;
    pages_done: number | null;
    pages_total: number | null;
    extraction_method: string | null;
  }>(sql`
    SELECT
      d.id                              AS id,
      d.source                          AS source,
      d.title                           AS title,
      d.mime_type                       AS mime_type,
      d.bytes                           AS bytes,
      (d.original_content IS NOT NULL)  AS has_original,
      COUNT(c.id)::int                  AS chunk_count,
      d.metadata                        AS metadata,
      d.created_at                      AS created_at,
      d.ingest_status                   AS ingest_status,
      d.ingest_error                    AS ingest_error,
      d.pages_done                      AS pages_done,
      d.pages_total                     AS pages_total,
      d.extraction_method               AS extraction_method
    FROM ${schema.documents} d
    LEFT JOIN ${schema.chunks} c ON c.document_id = d.id
    GROUP BY d.id
    ORDER BY d.created_at DESC
    LIMIT 200
  `);
  return NextResponse.json({
    documents: rows.map((r) => ({
      id: r.id,
      source: r.source,
      title: r.title,
      mimeType: r.mime_type,
      bytes: r.bytes,
      hasOriginal: r.has_original,
      chunkCount: r.chunk_count,
      metadata: r.metadata,
      createdAt:
        r.created_at instanceof Date ? r.created_at.toISOString() : new Date(r.created_at).toISOString(),
      ingestStatus: r.ingest_status,
      ingestError: r.ingest_error,
      pagesDone: r.pages_done ?? 0,
      pagesTotal: r.pages_total,
      extractionMethod: r.extraction_method,
    })),
  });
}

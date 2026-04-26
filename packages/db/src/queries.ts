import { asc, eq, sql } from 'drizzle-orm';
import { getDb } from './client.js';
import { documents, chunks, appSettings, type AppSettingsRow } from './schema.js';

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
  mimeType: string | null;
  bytes: number | null;
  hasOriginal: boolean;
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
    mime_type: string | null;
    bytes: number | null;
    has_original: boolean;
    chunk_count: number;
    metadata: Record<string, unknown>;
    created_at: Date | string;
  }>(sql`
    SELECT
      d.id                                    AS id,
      d.source                                AS source,
      d.title                                 AS title,
      d.mime_type                             AS mime_type,
      d.bytes                                 AS bytes,
      (d.original_content IS NOT NULL)        AS has_original,
      COUNT(c.id)::int                        AS chunk_count,
      d.metadata                              AS metadata,
      d.created_at                            AS created_at
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
    mimeType: r.mime_type,
    bytes: r.bytes,
    hasOriginal: r.has_original,
    chunkCount: r.chunk_count,
    metadata: r.metadata,
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
  }));
}

export interface DocumentDetail {
  id: string;
  source: string;
  title: string | null;
  mimeType: string | null;
  bytes: number | null;
  hasOriginal: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  chunkCount: number;
}

export async function getDocument(id: string): Promise<DocumentDetail | null> {
  const db = getDb();
  const rows = await db.execute<{
    id: string;
    source: string;
    title: string | null;
    mime_type: string | null;
    bytes: number | null;
    has_original: boolean;
    metadata: Record<string, unknown>;
    created_at: Date | string;
    chunk_count: number;
  }>(sql`
    SELECT
      d.id                                AS id,
      d.source                            AS source,
      d.title                             AS title,
      d.mime_type                         AS mime_type,
      d.bytes                             AS bytes,
      (d.original_content IS NOT NULL)    AS has_original,
      d.metadata                          AS metadata,
      d.created_at                        AS created_at,
      (SELECT COUNT(*)::int FROM ${chunks} c WHERE c.document_id = d.id) AS chunk_count
    FROM ${documents} d
    WHERE d.id = ${id}
    LIMIT 1
  `);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    source: r.source,
    title: r.title,
    mimeType: r.mime_type,
    bytes: r.bytes,
    hasOriginal: r.has_original,
    metadata: r.metadata,
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
    chunkCount: r.chunk_count,
  };
}

export interface OriginalContent {
  bytes: Buffer;
  mimeType: string;
  filename: string;
}

/**
 * Returns the raw `original_content` Buffer plus mime/source/title for a
 * document. Used by the vision-ingest job which needs the PDF bytes.
 */
export async function getDocumentBytes(
  id: string,
): Promise<{ id: string; source: string; title: string | null; mimeType: string | null; bytes: Buffer } | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: documents.id,
      source: documents.source,
      title: documents.title,
      mimeType: documents.mimeType,
      originalContent: documents.originalContent,
    })
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);
  if (!row || !row.originalContent) return null;
  const buf = Buffer.isBuffer(row.originalContent)
    ? row.originalContent
    : Buffer.from(row.originalContent as Uint8Array);
  return {
    id: row.id,
    source: row.source,
    title: row.title,
    mimeType: row.mimeType,
    bytes: buf,
  };
}

export async function getDocumentOriginal(id: string): Promise<OriginalContent | null> {
  const db = getDb();
  const [row] = await db
    .select({
      source: documents.source,
      mimeType: documents.mimeType,
      originalContent: documents.originalContent,
    })
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);
  if (!row || !row.originalContent) return null;
  return {
    bytes: Buffer.isBuffer(row.originalContent)
      ? row.originalContent
      : Buffer.from(row.originalContent as Uint8Array),
    mimeType: row.mimeType ?? 'application/octet-stream',
    filename: row.source,
  };
}

export interface ChunkListItem {
  id: string;
  ordinal: number;
  content: string;
  tokens: number | null;
  embedding?: number[] | null;
}

export async function listChunksForDocument(
  documentId: string,
  opts: { includeEmbedding?: boolean } = {},
): Promise<ChunkListItem[]> {
  const db = getDb();
  const rows = opts.includeEmbedding
    ? await db
        .select({
          id: chunks.id,
          ordinal: chunks.ordinal,
          content: chunks.content,
          tokens: chunks.tokens,
          embedding: chunks.embedding,
        })
        .from(chunks)
        .where(eq(chunks.documentId, documentId))
        .orderBy(asc(chunks.ordinal))
    : await db
        .select({
          id: chunks.id,
          ordinal: chunks.ordinal,
          content: chunks.content,
          tokens: chunks.tokens,
        })
        .from(chunks)
        .where(eq(chunks.documentId, documentId))
        .orderBy(asc(chunks.ordinal));
  return rows.map((r) => ({
    id: r.id,
    ordinal: r.ordinal,
    content: r.content,
    tokens: r.tokens ?? null,
    embedding: 'embedding' in r ? coerceVector(r.embedding) : undefined,
  }));
}

/**
 * Drizzle-orm types `vector` columns as `unknown` in select results because
 * pgvector can come back as either `number[]` (from postgres-js with array
 * parsing) or a stringified `[v1,v2,...]`. Normalize to `number[] | null`.
 */
function coerceVector(value: unknown): number[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === 'string') {
    const trimmed = value.replace(/^\[|\]$/g, '');
    if (trimmed.length === 0) return [];
    return trimmed.split(',').map((s) => Number(s.trim()));
  }
  return null;
}

export async function getSettingsRow(): Promise<AppSettingsRow | null> {
  const db = getDb();
  const rows = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  return rows[0] ?? null;
}

type SettingsPatch = Partial<Omit<AppSettingsRow, 'id' | 'updatedAt'>>;

export async function upsertSettings(partial: SettingsPatch): Promise<AppSettingsRow> {
  const db = getDb();
  const values: Record<string, unknown> = { id: 1, updatedAt: new Date(), ...partial };
  const setBlock: Record<string, unknown> = { updatedAt: new Date(), ...partial };
  const rows = await db
    .insert(appSettings)
    .values(values as typeof appSettings.$inferInsert)
    .onConflictDoUpdate({ target: appSettings.id, set: setBlock })
    .returning();
  return rows[0]!;
}

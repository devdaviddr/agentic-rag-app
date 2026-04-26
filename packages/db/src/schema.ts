import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  jsonb,
  integer,
  timestamp,
  index,
  vector,
} from 'drizzle-orm/pg-core';

const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM ?? 768);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(),
    title: text('title'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceIdx: index('documents_source_idx').on(t.source),
  }),
);

export const chunks = pgTable(
  'chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    content: text('content').notNull(),
    tokens: integer('tokens'),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIM }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    docOrdinalIdx: index('chunks_doc_ordinal_idx').on(t.documentId, t.ordinal),
    // HNSW index using cosine distance for ANN retrieval.
    embeddingIdx: index('chunks_embedding_idx')
      .using('hnsw', t.embedding.op('vector_cosine_ops'))
      .with({ m: 16, ef_construction: 64 }),
    contentTrgmIdx: index('chunks_content_trgm_idx').using(
      'gin',
      sql`${t.content} gin_trgm_ops`,
    ),
  }),
);

export type DocumentRow = typeof documents.$inferSelect;
export type NewDocumentRow = typeof documents.$inferInsert;
export type ChunkRow = typeof chunks.$inferSelect;
export type NewChunkRow = typeof chunks.$inferInsert;

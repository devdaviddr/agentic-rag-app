import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  jsonb,
  integer,
  real,
  timestamp,
  index,
  vector,
  customType,
  check,
} from 'drizzle-orm/pg-core';

const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM ?? 768);

// Drizzle-pg-core has no built-in `bytea` type; declare one that
// round-trips Buffer ↔ Postgres bytea using the driver's binary path.
// Without `toDriver`, drizzle stringifies Buffer (-> "[object Buffer]"),
// and postgres-js encodes that as a 0-byte bytea.
const bytea = customType<{
  data: Buffer;
  driverData: Buffer;
  default: false;
}>({
  dataType() {
    return 'bytea';
  },
  toDriver(value: Buffer): Buffer {
    return Buffer.isBuffer(value) ? value : Buffer.from(value);
  },
  fromDriver(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (typeof value === 'string' && value.startsWith('\\x')) {
      return Buffer.from(value.slice(2), 'hex');
    }
    throw new Error(`Unexpected bytea value type: ${typeof value}`);
  },
});

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(),
    title: text('title'),
    mimeType: text('mime_type'),
    bytes: integer('bytes'),
    originalContent: bytea('original_content'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ingestStatus: text('ingest_status').notNull().default('queued'),
    ingestError: text('ingest_error'),
    pagesTotal: integer('pages_total'),
    pagesDone: integer('pages_done').notNull().default(0),
    extractionMethod: text('extraction_method').notNull().default('text'),
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
    imageIds: uuid('image_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    page: integer('page'),
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
    imageIdsIdx: index('chunks_image_ids_idx').using('gin', t.imageIds),
  }),
);

export const documentImages = pgTable(
  'document_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    page: integer('page').notNull(),
    ordinal: integer('ordinal').notNull(),
    kind: text('kind').notNull(),
    mimeType: text('mime_type').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bbox: jsonb('bbox').$type<[number, number, number, number] | null>(),
    bytes: bytea('bytes').notNull(),
    summary: text('summary'),
    summaryEmbedding: vector('summary_embedding', { dimensions: EMBEDDING_DIM }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    docPageIdx: index('document_images_doc_page_idx').on(t.documentId, t.page, t.ordinal),
    embeddingIdx: index('document_images_embedding_idx')
      .using('hnsw', t.summaryEmbedding.op('vector_cosine_ops'))
      .with({ m: 16, ef_construction: 64 }),
  }),
);

export const appSettings = pgTable(
  'app_settings',
  {
    id: integer('id').primaryKey().default(1),
    ollamaBaseUrl: text('ollama_base_url'),
    chatModel: text('chat_model'),
    embedModel: text('embed_model'),
    visionModel: text('vision_model'),
    chatTemperature: real('chat_temperature'),
    ragTopK: integer('rag_top_k'),
    ragChunkSize: integer('rag_chunk_size'),
    ragChunkOverlap: integer('rag_chunk_overlap'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    onlyOneRow: check('app_settings_singleton', sql`${t.id} = 1`),
  }),
);

export type DocumentRow = typeof documents.$inferSelect;
export type NewDocumentRow = typeof documents.$inferInsert;
export type ChunkRow = typeof chunks.$inferSelect;
export type NewChunkRow = typeof chunks.$inferInsert;
export type DocumentImageRow = typeof documentImages.$inferSelect;
export type NewDocumentImageRow = typeof documentImages.$inferInsert;
export type AppSettingsRow = typeof appSettings.$inferSelect;
export type NewAppSettingsRow = typeof appSettings.$inferInsert;

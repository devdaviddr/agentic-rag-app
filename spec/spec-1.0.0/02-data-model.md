# Data Model

## Tables

### `documents`
| Column      | Type                       | Notes                              |
| ----------- | -------------------------- | ---------------------------------- |
| id          | uuid (pk, default random)  |                                    |
| source      | text not null              | URI / path / logical source key    |
| title       | text null                  | Human-readable title               |
| metadata    | jsonb not null default '{}'| Free-form (author, tags, mime)     |
| created_at  | timestamptz not null now() |                                    |

Indexes: `documents_source_idx (source)`.

### `chunks`
| Column       | Type                                                        | Notes                       |
| ------------ | ----------------------------------------------------------- | --------------------------- |
| id           | uuid (pk, default random)                                   |                             |
| document_id  | uuid not null fk → documents.id ON DELETE CASCADE           |                             |
| ordinal      | int not null                                                | Position in source document |
| content      | text not null                                               | Chunk text                  |
| tokens       | int null                                                    | Optional token count        |
| embedding    | vector(EMBEDDING_DIM)                                       | nomic-embed-text → 768      |
| metadata     | jsonb not null default '{}'                                 |                             |
| created_at   | timestamptz not null now()                                  |                             |

Indexes:
- `chunks_doc_ordinal_idx (document_id, ordinal)` — reassemble in order.
- `chunks_embedding_idx HNSW (embedding vector_cosine_ops)` — ANN.
- `chunks_content_trgm_idx GIN (content gin_trgm_ops)` — keyword fallback.

## Embedding dimension
Set at table creation via `EMBEDDING_DIM`. Changing it requires:
1. Update env + restart.
2. Generate a new migration (drizzle-kit) altering the vector column.
3. Re-embed all chunks (run a backfill script).

## Cascading
Deleting a document deletes its chunks (FK cascade). No orphan rows.

## Future tables (sketched, not in v1)
- `conversations` (id, created_at, user_id?)
- `messages` (conversation_id, role, content, tool_calls jsonb)
- `runs` (agent run trace for debugging)

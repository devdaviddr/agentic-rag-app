# Architecture

## Monorepo layout
```
apps/
  web/                Next.js 15 app (UI + API routes)
packages/
  shared/             zod schemas, env loader, shared types
  db/                 Drizzle schema, client, migrate runner
  rag/                chunker, embedder, ingest, retrieve
  agent/              AI SDK agent loop + tools + prompts
docker/postgres/      DB init SQL (CREATE EXTENSION vector)
scripts/              dev helpers (ollama-pull.sh)
spec/                 design docs
```

Dependency direction (no cycles):
```
shared  ◄── db ◄── rag ◄── agent ◄── web
                  │
                  └────────────┘ (web also imports rag/db/shared directly)
```

## Components

### `packages/shared`
- `schemas.ts`: zod schemas + inferred types for `Document`, `Chunk`,
  `RetrievalResult`, `IngestRequest`, `ChatMessage`.
- `env.ts`: validated env loader, single source of truth for config.

### `packages/db`
- `schema.ts`: Drizzle table defs for `documents`, `chunks`. `chunks.embedding`
  is `vector(EMBEDDING_DIM)`. HNSW index with `vector_cosine_ops`.
- `client.ts`: lazy singleton `postgres-js` connection.
- `migrate.ts`: applies `./drizzle` migrations on boot/CI.

### `packages/rag`
- `chunker.ts`: recursive character splitter with overlap.
- `embeddings.ts`: thin wrapper over `ollama-ai-provider` + AI SDK
  `embed`/`embedMany`.
- `ingest.ts`: `chunk → embed → INSERT documents+chunks` in one tx.
- `retrieve.ts`: cosine ANN search returning top-k with source metadata.

### `packages/agent`
- `tools.ts`: AI SDK tools — `search_kb`, `fetch_doc`, `list_sources`.
- `prompts.ts`: system prompt enforcing tool-first behavior + citations.
- `agent.ts`: `streamText` with tools, `maxSteps` cap on tool-use rounds.

### `apps/web`
- `app/api/chat/route.ts`: POST → `runAgent(...)` → `toDataStreamResponse()`.
- `app/api/ingest/route.ts`: POST → `ingestDocument(...)`.
- `components/chat.tsx`: client component using `useChat` from `ai/react`.

## Request lifecycle (chat)
```
client (useChat)
  ─POST /api/chat──►  Next route (Node runtime)
                       ├─ build embedder (Ollama)
                       ├─ runAgent → streamText
                       │    ├─ model decides: tool call?
                       │    ├─ search_kb → retrieve() → pgvector ANN
                       │    ├─ (loop up to maxSteps)
                       │    └─ final assistant message
                       └─ toDataStreamResponse()  ──► client stream
```

## Why pgvector + HNSW (not a separate vector DB)
- Single source of truth, transactional ingest with metadata.
- HNSW index gives sub-50ms ANN at low/medium scale (<1M chunks).
- Easy hybrid search later: HNSW + `pg_trgm` GIN index already in place.

## Future expansion points
- Reranker (e.g. `bge-reranker`) between `retrieve` and the model.
- BM25 hybrid via `tsvector` or `paradedb` for keyword recall.
- LangGraph if multi-agent / branching workflows appear.
- Per-user namespaces via row-level filter on `documents.metadata.user_id`.

# Architecture

This document describes how Agentic RAG is wired together — the components, the data they own, and the request flows that turn an uploaded PDF into a chat answer with inline figures.

For the README, see [`README.md`](./README.md). For the v1.0.0 design contract, see [`spec/1.0.0/pdfupload.md`](./spec/1.0.0/pdfupload.md).

---

## At a glance

```
                           ┌────────────────────────────────────────────┐
                           │                Browser (you)               │
                           │  Next.js client — chat, documents, settings│
                           └────────────────┬───────────────────────────┘
                                            │  HTTP (SSE for /api/chat)
                                            ▼
 ┌────────────────────────────────────────────────────────────────────────────┐
 │                          Next.js 15 app  (apps/web)                         │
 │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────────────┐  │
 │  │ /            │  │ /documents   │  │ /settings  │  │ /api/* routes     │  │
 │  │ chat UI      │  │ upload + list│  │ form       │  │ chat, ingest,     │  │
 │  │ react-mark-  │  │ status poll  │  │ + dropdowns│  │ assets, sources,  │  │
 │  │ down render  │  │ doc viewer   │  │ tag probe  │  │ documents/*, ...  │  │
 │  └──────┬───────┘  └──────┬───────┘  └──────┬─────┘  └────────┬──────────┘  │
 │         │                 │                 │                 │             │
 │         ▼                 ▼                 ▼                 ▼             │
 │  ┌────────────────────────────────────────────────────────────────────────┐ │
 │  │                   image-guarantee · getSettings · telemetry           │ │
 │  └────────────────────────────────────────────────────────────────────────┘ │
 │         │                 │                                 │              │
 │         │                 │     ┌───────────────────────────┘              │
 │         │                 │     │                                          │
 │         ▼                 ▼     ▼                                          │
 │  ┌─────────────┐  ┌─────────────────────┐    ┌──────────────────────────┐  │
 │  │ @app/agent  │  │     @app/rag         │    │       @app/db            │  │
 │  │             │  │  chunker, embedder,  │    │  Drizzle schema + queries│  │
 │  │ runAgent()  │  │  retrieve,           │    │  documents, chunks,      │  │
 │  │ + tools:    │  │  retrieveFigures,    │    │  document_images,        │  │
 │  │  search_kb  │  │  ingest, ingest-pdf, │    │  app_settings            │  │
 │  │  find_      │  │  vision, raster      │    │                          │  │
 │  │  figure     │  │                      │    │                          │  │
 │  │  fetch_doc  │  │                      │    │                          │  │
 │  │  list_      │  │                      │    │                          │  │
 │  │  sources    │  │                      │    │                          │  │
 │  └─────┬───────┘  └─────────┬────────────┘    └────────────┬─────────────┘  │
 │        │                    │                              │                │
 └────────┼────────────────────┼──────────────────────────────┼────────────────┘
          │                    │                              │
          ▼                    ▼                              ▼
   ┌────────────┐       ┌────────────┐             ┌─────────────────────┐
   │  Ollama    │       │  Ollama    │             │  Postgres + pgvector│
   │  chat LLM  │       │  vision +  │             │  pg_trgm            │
   │  (HTTP)    │       │  embed LLM │             │  (Compose service)  │
   │  external  │       │  (HTTP)    │             │                     │
   └────────────┘       └────────────┘             └─────────────────────┘
```

The whole loop is local — Postgres runs in Compose, Ollama runs on the host or LAN. No SaaS dependencies.

---

## Components

### `apps/web` — Next.js 15

Server components, API routes, React 19 client islands. Tailwind v4 design system with `@theme` tokens (see `apps/web/src/app/globals.css`).

Key client surfaces:

| Path                  | Component                                  | Purpose                                                       |
| --------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| `/`                   | `components/chat.tsx` + `markdown.tsx`     | Chat with `useChat` from AI SDK. `<ChatMarkdown>` renders     |
|                       |                                            | the assistant message via `react-markdown` + `remark-gfm`     |
|                       |                                            | with a custom `urlTransform` that maps `asset:UUID` →         |
|                       |                                            | `/api/assets/UUID`.                                           |
| `/documents`          | `components/sources-panel.tsx`             | Drag-and-drop upload, live status polling, status pills,      |
|                       |                                            | progress bar, delete.                                          |
| `/documents/[id]`     | `components/document-viewer.tsx`           | Tabs: Original / Chunks & embeddings / Pages (rasters +       |
|                       |                                            | figure rail).                                                  |
| `/settings`           | `components/settings-form.tsx`             | DB-overlays-env. Test-connection probes Ollama tags;          |
|                       |                                            | model fields are dropdowns auto-populated from `/api/tags`.   |

Key server surfaces (`apps/web/src/app/api/...`):

| Route                                  | What it does                                                    |
| -------------------------------------- | --------------------------------------------------------------- |
| `POST /api/chat`                       | Stream chat response via `runAgent()`. Wraps the AI SDK         |
|                                        | `experimental_transform` with `applyImageGuarantee` so the      |
|                                        | final message is patched to include any dropped figure refs.    |
| `POST /api/ingest`                     | Synchronous text/markdown ingest.                               |
| `POST /api/ingest/upload`              | Multipart upload. PDFs return `202` and run `runIngestJob` via  |
|                                        | Next 15 `after()`. Per-document fingerprint mutex returns `409` |
|                                        | on duplicate-in-flight.                                         |
| `GET  /api/sources`                    | List documents with status + counts.                            |
| `GET  /api/documents/[id]`             | Document details.                                               |
| `DELETE /api/documents/[id]`           | Cascade-deletes chunks + document_images via FK.                |
| `GET  /api/documents/[id]/status`      | Live ingest status for the polling UI.                          |
| `GET  /api/documents/[id]/chunks`      | Per-chunk debug view.                                           |
| `GET  /api/documents/[id]/original`    | Stream the original file bytes.                                 |
| `GET  /api/documents/[id]/images`      | Metadata for page rasters + figure crops.                       |
| `GET  /api/assets/[id]`                | Stream a single image (PNG, immutable cache).                   |
| `GET  /api/settings` / `PATCH`         | Read or update overrides; invalidates the in-process cache.     |
| `GET  /api/ollama/tags`                | Proxies `${baseUrl}/api/tags`. Accepts `?baseUrl=` override.    |

### `packages/shared`

Zod env loader, the `ResolvedSettings` type, and shared schemas (`Document`, `Chunk`, `RetrievalResult` with optional `imageRefs[]`, `IngestRequest`, `ChatMessage`).

### `packages/db`

Drizzle schema and queries (`packages/db/src/schema.ts`, `queries.ts`). Tables:

- `documents` — source, title, MIME, original bytes (bytea), `ingest_status`, `pages_done`, `pages_total`, `extraction_method`.
- `chunks` — content, embedding (vector), `image_ids` (uuid array, GIN-indexed), `page`.
- `document_images` — page rasters and figure crops with bytea bytes, `summary`, and an HNSW-indexed `summary_embedding` (powers figure-only retrieval).
- `app_settings` — singleton row (`CHECK id=1`) holding optional overrides.

### `packages/rag`

Domain logic. No HTTP, no React.

| Module                | Role                                                           |
| --------------------- | -------------------------------------------------------------- |
| `chunker.ts`          | Recursive char-based splitter + `mergeAssetTokens` post-pass   |
|                       | so `![alt](asset:UUID)` blocks survive chunk boundaries.       |
| `embeddings.ts`       | `createEmbedder({ baseUrl, model })` — wraps the AI SDK +      |
|                       | `ollama-ai-provider`. Normalizes `/api` suffix.                |
| `pdf.ts`              | `extractPdfText` (legacy text path) + `ensurePdfjs` (lazy      |
|                       | `configureUnPDF({ pdfjs: () => import('unpdf/pdfjs') })`).     |
| `polyfills.ts`        | Side-effect module: installs `Promise.try` polyfill before     |
|                       | unpdf's bundled pdfjs evaluates. Side-effect-imported by       |
|                       | `pdf.ts`, `raster.ts`, `ingest-pdf.ts`.                        |
| `raster.ts`           | `rasterizePage`, `resizeLongestEdge`, `cropByBbox` via         |
|                       | `@napi-rs/canvas`. 8192 px input cap, 1 % bbox guard.          |
| `vision.ts`           | `createVisionClient`, `ocrPage`, `detectFigures`,              |
|                       | `summarizeFigure`. Defensive JSON parse for figure-detect.     |
| `prompts.ts`          | OCR / figure-detect / summary prompts.                         |
| `ingest.ts`           | Synchronous text ingest path.                                  |
| `ingest-pdf.ts`       | The async vision-OCR job (`runIngestJob`).                     |
| `retrieve.ts`         | HNSW ANN over `chunks.embedding`. Joins                        |
|                       | `document_images` to attach `imageRefs[]` per result.          |
| `retrieve-figures.ts` | HNSW ANN over `document_images.summary_embedding`. Powers      |
|                       | the agent's `find_figure` tool.                                |
| `util/sema.ts`        | Tiny FIFO semaphore. Caps page-level concurrency at 2.         |

### `packages/agent`

`runAgent()` builds the tool set and wraps the AI SDK `streamText` loop with `simulateStreaming: true` (works around an Ollama-provider tool-calling bug in AI SDK v4).

Tools:

- `search_kb` — semantic chunk search. Returns content + source + ordinal + optional `imageRefs[]`.
- `find_figure` — figure-summary search. Returns pre-baked `assetMarkdown` strings (`![title (p.N)](asset:UUID)`) so small chat models can copy verbatim.
- `fetch_doc` — full document by id.
- `list_sources` — document list.

The system prompt (`packages/agent/src/prompts.ts`) includes mandatory image-rendering rules and a few-shot example.

---

## Data flow — PDF upload to a queryable knowledge base

```
 ┌───────────────────────────────────────────────────────────────────────────┐
 │                       POST /api/ingest/upload                              │
 │                                                                            │
 │  ┌───────────────┐    ┌────────────────────────┐                           │
 │  │ multipart parse│ -> │ kind = pdf | text | md │                           │
 │  └───────────────┘    └─────────┬──────────────┘                           │
 │                                 │                                          │
 │   PDF path                  text/md path                                   │
 │  ───────────                ─────────────                                  │
 │   fingerprint mutex          synchronous ingestDocument()                   │
 │   insert documents row       chunkText -> embedBatch -> insert chunks      │
 │   status='queued'            status='ready'                                │
 │   202 + after(runJob)                                                      │
 │     |                          |                                            │
 └─────┼──────────────────────────┼────────────────────────────────────────────┘
       │                          │
       ▼                          ▼
 ┌─────────────────────────┐    ┌───────────────────────────────┐
 │     runIngestJob        │    │           Postgres             │
 │ (packages/rag/ingest-pdf│    │   documents, chunks            │
 │  .ts, fires off Next's  │    │   document_images, app_settings│
 │  after() hook)          │    └───────────────────────────────┘
 │                         │
 │  status='rasterizing'   │   Vision flow per page (concurrency 2):
 │  ensurePdfjs            │
 │  loop pages:            │   ┌────────────────────────────────────┐
 │    rasterizePage        │   │ 1. raster page (PNG) at scale 2.0  │
 │    resize 1792 px       │──▶│    resize longest edge to 1792 px  │
 │    ocrPage              │   │ 2. ocrPage  -> markdown            │
 │    detectFigures        │   │ 3. detectFigures -> JSON [bbox+caps]│
 │    for each fig:        │   │ 4. cropByBbox + summarizeFigure    │
 │      crop, summarize,   │   │ 5. insert document_images          │
 │      insert image       │   │    (kind='page' + kind='figure')   │
 │      splice asset:UUID  │   │ 6. inject ![alt](asset:UUID) into  │
 │    pages_done++         │   │    page markdown                   │
 │                         │   └────────────────────────────────────┘
 │  status='embedding'     │
 │  combinedMd = pages.join│   Chunking + embedding:
 │  chunkText (atomicity)  │
 │  embedBatch chunks      │   ┌────────────────────────────────────┐
 │  insert chunks (image_  │──▶│ chunkText with mergeAssetTokens    │
 │    ids extracted)       │   │ post-pass keeps asset:UUID atomic  │
 │  embedBatch summaries   │   │ embedBatch -> insert chunks        │
 │  update summary_        │   │ embed each figure summary ->       │
 │    embedding            │   │ document_images.summary_embedding  │
 │  status='ready'         │   └────────────────────────────────────┘
 │  extraction_method=     │
 │  'vision'               │
 └─────────────────────────┘
```

If anything throws after `getDocumentProxy` succeeds, the job catches, sets `status='failed'`, stores `ingest_error`, and (for "vision model not pulled" errors) falls back to the legacy text-extraction path so the document still ends `ready` with `extraction_method='text'`.

---

## Data flow — chat with image rendering

```
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │                              POST /api/chat                                   │
 │                                                                               │
 │  user message + history                                                       │
 │     │                                                                         │
 │     ▼                                                                         │
 │  getSettings() ─────► chatModel, ragTopK, chatTemperature                     │
 │     │                                                                         │
 │     ▼                                                                         │
 │  runAgent(streamText loop, max 5 steps, simulateStreaming)                    │
 │     │     ┌────────────────────────────────────────────────────────┐         │
 │     │     │  agent reasons. when user asks visually, calls         │         │
 │     │     │  find_figure(query). otherwise calls search_kb.        │         │
 │     │     │                                                        │         │
 │     │     │  search_kb  -> retrieve.ts  -> ANN on chunks +         │         │
 │     │     │                join document_images for imageRefs[]    │         │
 │     │     │                                                        │         │
 │     │     │  find_figure -> retrieve-figures.ts -> ANN on          │         │
 │     │     │                document_images.summary_embedding       │         │
 │     │     │                returns pre-baked assetMarkdown strings │         │
 │     │     └────────────────────────────────────────────────────────┘         │
 │     │                                                                         │
 │     ▼                                                                         │
 │  experimental_transform = createImageGuaranteeTransform({                    │
 │     userMessage, toolResults                                                  │
 │  })                                                                           │
 │     │                                                                         │
 │     │   buffers text-delta parts. on finish:                                  │
 │     │     1. detect visual intent in user message (regex)                     │
 │     │     2. collect figure UUIDs from findFigure + search_kb tool results    │
 │     │     3. count UUIDs already present in assistant text                    │
 │     │     4. if visual intent && missing UUIDs:                               │
 │     │          append "**Related figure(s)**" block (cap 3)                   │
 │     │     5. if STILL no asset: token && visual intent && candidates:         │
 │     │          PREPEND top figure (hard fallback)                             │
 │     │     6. log [chat] image_inject {reason, count}                          │
 │     │                                                                         │
 │     ▼                                                                         │
 │  data-stream response to client                                               │
 └────────────────────────────────────────┬────────────────────────────────────┘
                                          │
                                          ▼
                       ┌──────────────────────────────────┐
                       │     Browser (chat.tsx)           │
                       │                                  │
                       │  AssistantMessage renders via    │
                       │  <ChatMarkdown> which uses       │
                       │  react-markdown + remark-gfm.    │
                       │                                  │
                       │  urlTransform:                   │
                       │   asset:UUID -> /api/assets/UUID │
                       │   else delegate to default       │
                       │   safelist (drops javascript:,   │
                       │   data:, etc.)                   │
                       │                                  │
                       │  custom <img>: rounded card,     │
                       │   wrapped in <a target=_blank>,  │
                       │   onError -> text-danger fallback│
                       └─────────────┬────────────────────┘
                                     │
                                     ▼
                       GET /api/assets/<UUID>
                       (Postgres bytea, immutable cache)
```

The image-render guarantee is enforced in three layers, exactly as the spec mandates:

1. **System prompt** — agent is told to call `find_figure` on visual intent and to copy `![alt](asset:UUID)` markdown verbatim, with a few-shot example.
2. **Server post-processor** — `applyImageGuarantee` appends a "Related figure(s)" block when visual intent is detected and tool results returned UUIDs the assistant dropped.
3. **Hard fallback** — if the patched text still has zero `asset:UUID` tokens, the top-ranked figure is prepended unconditionally.

A Vitest test in `apps/web/src/__tests__/chat-render.test.tsx` mounts `<ChatMarkdown>` with an `asset:UUID` message and asserts an `<img src="/api/assets/...">` element actually mounts in jsdom. Phase C of the rollout was gated on this test passing.

---

## Schema details (selected)

```sql
documents
  id uuid PK
  source / title / mime_type / bytes
  original_content bytea               -- full upload
  ingest_status text DEFAULT 'queued'  -- queued | rasterizing | ocr | embedding | ready | failed
  pages_total int / pages_done int
  extraction_method text DEFAULT 'text'-- 'text' | 'vision'
  metadata jsonb / created_at

chunks
  id uuid PK / document_id FK CASCADE
  ordinal / content / tokens
  embedding vector(EMBEDDING_DIM)      -- HNSW cosine
  image_ids uuid[]                     -- GIN-indexed; subset of document_images.id
  page int                             -- 1-based source page (vision path)
  metadata jsonb / created_at

document_images
  id uuid PK / document_id FK CASCADE
  page int / ordinal int / kind text   -- 'page' | 'figure'
  mime_type / width / height / bbox jsonb
  bytes bytea                          -- PNG bytes
  summary text                         -- 1-2 sentence vision-generated description
  summary_embedding vector(EMBEDDING_DIM) -- HNSW cosine, powers find_figure
  created_at

app_settings
  id integer PK CHECK (id = 1)         -- singleton
  ollama_base_url / chat_model / embed_model / vision_model
  chat_temperature real
  rag_top_k / rag_chunk_size / rag_chunk_overlap
  updated_at
```

---

## Build, deploy, runtime

- `pnpm` workspaces. Each package in `packages/*` has `composite: true` + project references and uses `tsc -b` so `pnpm --filter @app/web... build` is hermetic in a clean Docker container.
- Container: `node:22-alpine`. The bundled pdfjs in `unpdf@1.6` calls `Promise.try`, which only landed in V8 13.0; Node 22.22 doesn't ship it, so `packages/rag/src/polyfills.ts` is side-effect-imported wherever pdfjs is loaded.
- Compose orchestrates `postgres` + `migrate` + `web`. Ollama is **outside** the stack — point `OLLAMA_BASE_URL` at it.

---

## Telemetry

Every state transition emits a single-line JSON log via `apps/web/src/lib/telemetry.ts`:

```
[ingest] {"event":"queued","documentId":"...","source":"...","fingerprint":"..."}
[ingest] {"event":"job_start","documentId":"...","visionModel":"...","embedModel":"..."}
[ingest] {"event":"page_done","documentId":"...","pagesDone":3,"pagesTotal":4}
[ingest] {"event":"job_success","documentId":"..."}
[chat]   {"event":"request","chatModel":"...","topK":6,"temperature":0.2}
[chat]   {"event":"image_inject","reason":"related_block","count":1}
```

Grep-friendly. Plain `docker logs rag-web | grep '\[chat\]'` is enough to see what the agent is doing.

---

## Where to look next

| You want to                              | Read                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------- |
| Run it                                   | [`README.md`](./README.md)                                            |
| Understand the v1.0.0 design + rationale | [`spec/1.0.0/pdfupload.md`](./spec/1.0.0/pdfupload.md)                |
| Add a tool to the agent                  | `packages/agent/src/tools.ts`                                         |
| Tune the chunker                         | `packages/rag/src/chunker.ts`                                         |
| Change the chat UI                       | `apps/web/src/components/{chat,markdown}.tsx`                         |
| Add a setting                            | schema (`packages/db/src/schema.ts`) + resolver (`apps/web/src/lib/settings.ts`) + form (`apps/web/src/components/settings-form.tsx`) |

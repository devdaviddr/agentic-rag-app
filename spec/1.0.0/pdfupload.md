# Spec 1.0.0 — Vision-OCR PDF Ingest, Image Citations, Settings Page

Status: **Draft for approval** · Owner: web/rag · Target: agentic-rag-app v1.0.0

---

## 1. Goal

Replace the current text-only PDF extraction (`unpdf` → flat text) with a vision-LLM ingest pipeline that:

1. Rasterizes each PDF page to PNG.
2. Calls a local Ollama vision model (**`gemma3:4b`**) to OCR each page into clean GitHub-flavored markdown.
3. Detects figures on each page, crops them, summarizes each crop with the same vision model, stores the crop bytes + summary, and emits an inline `![alt](asset:<uuid>)` reference at the right spot in the page markdown.
4. Embeds (a) the markdown chunks and (b) the figure summaries into the existing pgvector index, so retrieval surfaces both text passages and figures.
5. Lets the chat agent return image references inline; the chat UI renders them as `<img>` tags by rewriting `asset:<uuid>` → `/api/assets/<uuid>`.
6. **Guarantees that questions about a figure return the figure inline.** When a user asks about an image (e.g. "show me the latency chart", "what does Figure 3 look like?"), the chat response MUST contain the matching `![alt](asset:<uuid>)` markdown so the UI renders the image. This is enforced by (a) a dedicated `find_figure` tool that searches figure summaries directly, (b) a system-prompt rule that obliges figure markdown when relevant, and (c) a server-side post-processor that appends a "Related figure(s)" block when the model retrieves figures but forgets to render them.

Add a `/settings` page so the user can configure `OLLAMA_BASE_URL`, chat model, embed model, vision model, and a few RAG knobs at runtime (DB overlays env, env stays the bootstrap default).

## 2. Non-goals

- **Multi-image-per-call OCR.** v1 sends one page-image per request — Apple-Silicon Metal flakiness with multi-image gemma3 (Ollama #9697, #10986) and per-page attribution both push us here.
- **Embedded-XObject extraction.** Out of scope for v1 — page-rasterized + vision-detected figure regions handle scanned PDFs and vector charts uniformly.
- **Dark theme / mobile drawer for settings.** Use the existing AppShell as-is.
- **Job queue / external worker.** v1 uses `waitUntil`-style fire-and-forget on the Node runtime and surfaces progress via DB status columns.
- **Re-ingest on settings change.** Switching `embedModel` requires the user to re-upload affected docs; the settings UI warns instead of automating this.
- **Auth / multi-user.** Single-user, local-first stays the model.

## 3. User stories

| # | As a … | I want to … | So that … |
|---|---|---|---|
| US-1 | local user | upload a scanned PDF | I can search it as if it were text. |
| US-2 | local user | upload a paper with charts | I can ask "what does the latency chart show?" and get the chart inline. |
| US-3 | local user | watch ingest progress | I know how far through OCR a 50-page PDF is. |
| US-4 | local user | open `/settings` | I can point at a remote Ollama or change the vision model without editing `.env`. |
| US-5 | local user | click an image in a chat answer | I can preview/zoom the figure. |
| US-6 | local user | re-upload the same PDF after switching embed model | the index uses the new vectors. |
| US-7 | local user | ask "show me the chart on page 4" | the chart from page 4 renders inline in the assistant's reply, not just a description of it. |
| US-8 | local user | ask a vague question like "what does the architecture diagram look like?" | retrieval finds the diagram by its vision-generated summary even when surrounding text doesn't say "diagram", and the diagram renders inline. |

## 4. Out-of-band assumptions

- User is running **Ollama ≥ 0.10** locally with the `gemma3:4b`, `llama3.1:8b`, and `nomic-embed-text` tags pulled.
- Postgres has the `pgvector` and `pg_trgm` extensions (already required).
- macOS arm64 + Node ≥ 20. `@napi-rs/canvas` ships prebuilt arm64-darwin binaries; no Homebrew prerequisites.
- The compose stack at port 3000 is the canonical runtime; `pnpm dev` (which we ran on 3001 during the UI redesign) is the dev runtime.

## 5. Surface contracts to preserve (do not break)

From the existing audit:

- **DB-facing types:** `DocumentRow`, `NewDocumentRow`, `ChunkRow`, `NewChunkRow`, `documents`, `chunks` schema exports.
- **Shared schemas:** `Document`, `Chunk`, `RetrievalResult`, `IngestRequest`, `ChatMessage`.
- **rag exports:** `Embedder`, `EmbeddingClientOptions`, `IngestOptions`, `IngestExtras`, `IngestResult`, `RetrieveOptions`, `chunkText`, `createEmbedder`, `ingestDocument`, `retrieve`, `extractPdfText` (kept as a fallback path).
- **agent exports:** `ToolDeps`, `AgentTools`, `RunAgentOptions`, `runAgent`, `SYSTEM_PROMPT`.
- **API endpoints:** `/api/ingest`, `/api/ingest/upload`, `/api/chat`, `/api/sources`, `/api/documents/[id]`, `/api/documents/[id]/original`, `/api/documents/[id]/chunks` — request/response shapes stay backward compatible; new optional fields only.

New surface added (not breaking): `/api/settings`, `/api/assets/[id]`, `/api/documents/[id]/status`, `/api/documents/[id]/images`, `/api/ollama/tags`, document_images table, chunks.image_ids column, documents.ingest_status + pages_done + pages_total columns, ResolvedSettings type from `@app/shared`. Agent gains a new `find_figure` tool. `RetrievalResult` gains optional `imageRefs[]`. A new `FigureHit` shape is exported from `@app/shared`.

---

## 6. Architecture

```
                              ┌──────────────────────────────────┐
   POST /api/ingest/upload    │  Next.js route (Node runtime)    │
   ────────────────────────►  │  • multipart parse + size check  │
                              │  • detect kind (text|pdf)        │
                              │  • insert documents row          │
                              │    status='queued'               │
                              │    original_content=<bytea>      │
                              │  • return 202 { documentId }     │
                              │  • waitUntil(runIngestJob(id))   │
                              └──────────────┬───────────────────┘
                                             │
                                             ▼
                              ┌──────────────────────────────────┐
                              │  runIngestJob(documentId)        │
                              │  packages/rag/src/ingest-pdf.ts  │
                              │                                  │
                              │  for each page:                  │
                              │    raster = renderPage(scale=2)  │
                              │    raster.resize(longest=1792)   │
                              │    md = ocr(raster, gemma3:4b)   │
                              │    figs = detect(raster, ...)    │
                              │    for each fig:                 │
                              │       crop, summary, embed →     │
                              │       insert document_images     │
                              │       splice ![alt](asset:UUID)  │
                              │                                  │
                              │    update pages_done++           │
                              │                                  │
                              │  chunkText(combinedMarkdown)     │
                              │  embedBatch(chunks)              │
                              │  insert chunks (image_ids ∋ ...) │
                              │  status='ready'                  │
                              └──────────────────────────────────┘

                              ┌──────────────────────────────────┐
   POST /api/chat (SSE)       │  agent.ts                        │
   ────────────────────────►  │  search_kb tool                  │
                              │   → retrieve + join images       │
                              │   → { content, imageRefs[] }     │
                              │  System prompt: "preserve        │
                              │   asset:UUID image markdown"     │
                              └──────────────┬───────────────────┘
                                             │ stream
                                             ▼
                              ┌──────────────────────────────────┐
                              │  chat.tsx (react-markdown)       │
                              │  uriTransformer:                 │
                              │   asset:UUID → /api/assets/UUID  │
                              └──────────────────────────────────┘
```

### 6.1 Concurrency model

- **One job per upload.** `runIngestJob(documentId)` is launched via `waitUntil(...)` from the upload route. The Node runtime keeps it alive after the response is flushed.
- **Page-level concurrency cap = 2.** Ollama serializes on the GPU; 2 in flight balances pipeline overhead vs queue starvation. Implement with a tiny semaphore in `packages/rag/src/util/sema.ts` (no external dep).
- **Per-document mutex.** A second upload of the same `(filename, hash)` while the first is running should reject with 409.

---

## 7. Data model changes

### 7.1 `documents` — add columns

| Column | Type | Default | Purpose |
|---|---|---|---|
| `ingest_status` | text | `'queued'` | enum-style: `queued \| rasterizing \| ocr \| embedding \| ready \| failed` |
| `ingest_error` | text | null | last error message when status='failed' |
| `pages_total` | integer | null | filled after first PDF parse |
| `pages_done` | integer | 0 | incremented per page completed |
| `extraction_method` | text | `'text'` | `'text' \| 'vision'` — distinguishes legacy ingests |

### 7.2 `chunks` — add column

| Column | Type | Default | Purpose |
|---|---|---|---|
| `image_ids` | uuid[] | `'{}'` | denormalized list of `document_images.id` referenced by this chunk's content |
| `page` | integer | null | 1-based source page; populated for vision-extracted chunks |

GIN index on `image_ids` for fast lookup of "which chunks reference this image":
`CREATE INDEX chunks_image_ids_idx ON chunks USING GIN (image_ids);`

### 7.3 New table — `document_images`

```ts
// packages/db/src/schema.ts
export const documentImages = pgTable(
  'document_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
    page: integer('page').notNull(),                      // 1-based
    ordinal: integer('ordinal').notNull(),                // order within page
    kind: text('kind').notNull(),                         // 'page' | 'figure'
    mimeType: text('mime_type').notNull(),                // 'image/png'
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bbox: jsonb('bbox').$type<[number, number, number, number] | null>(), // [x,y,w,h] in 0..1; null for full-page
    bytes: bytea('bytes').notNull(),
    summary: text('summary'),                              // 1–2 sentences; null for kind='page'
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
```

`kind='page'` rows store the rasterized page PNG (used by the document viewer to render previews without a client-side pdfjs bundle). `kind='figure'` rows store cropped figure PNGs and are the targets of `asset:` references.

### 7.4 New table — `app_settings`

```ts
export const appSettings = pgTable(
  'app_settings',
  {
    id: integer('id').primaryKey().default(1),         // pinned to 1
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
```

Migration seeds one all-`NULL` row at id=1.

### 7.5 Migration

Single migration: `packages/db/drizzle/0002_vision_ocr.sql` (Drizzle Kit generates from schema diff). Includes column adds, new tables, GIN index, HNSW index, and the seed insert.

---

## 8. Settings layer

### 8.1 Resolver

New file `packages/shared/src/settings.ts`:

```ts
export interface ResolvedSettings {
  ollamaBaseUrl: string;
  chatModel: string;
  embedModel: string;
  visionModel: string;
  chatTemperature: number;
  ragTopK: number;
  ragChunkSize: number;
  ragChunkOverlap: number;
}
```

`packages/db/src/queries.ts` adds `getSettingsRow()` / `upsertSettings(partial)`. Web app exposes `getSettings(): Promise<ResolvedSettings>` that:

1. Reads the `app_settings` row.
2. Reads env via existing `loadEnv()`.
3. Returns env value when row column is null.
4. Caches the resolved object in-process for 30s; cache is invalidated by `upsertSettings`.

`OLLAMA_VISION_MODEL` is added to `EnvSchema` with default `'gemma3:4b'`.

All hot paths that today read `loadEnv().OLLAMA_*` are switched to `await getSettings()`:

- `apps/web/src/lib/embedder.ts` — embedder singleton becomes a per-request resolver that takes `(baseUrl, embedModel)`. Cached by `(baseUrl, embedModel)` tuple.
- `apps/web/src/app/api/chat/route.ts` — passes `chatModel`, `chatTemperature`, `ragTopK` to `runAgent`.
- New `apps/web/src/lib/vision.ts` — vision model client factory (mirror of `embedder.ts`).

### 8.2 API routes

- `GET /api/settings` → `{ resolved: ResolvedSettings, overrides: Partial<ResolvedSettings>, envDefaults: ResolvedSettings }`. The UI uses `overrides` to render which fields are user-set vs env-defaulted.
- `PATCH /api/settings` body validated by a partial Zod schema; nulls clear the override and fall back to env. Returns the new `getSettings()` result.
- `GET /api/ollama/tags` → proxies `${ollamaBaseUrl}/api/tags` and returns `{ models: { name, size, digest, modified_at }[] }`. Used by the Settings test-connection button.

### 8.3 UI

`apps/web/src/app/settings/page.tsx`:

- Reuses the existing AppShell. New sidebar nav item **Settings** (gear icon) added in `apps/web/src/components/sidebar.tsx`.
- Two-column form: left = labels + helper text, right = inputs. Sections:
  - **Ollama** — base URL + Test connection button. Result row shows model count + per-model availability (✓ pulled / ✗ missing with `ollama pull <name>` copy hint) for `chatModel`, `embedModel`, `visionModel`.
  - **Models** — three model name inputs. Embed-model field has a banner warning that changes require re-uploading affected docs (vector dim drift).
  - **Chat** — temperature slider 0.0–1.0 step 0.05, default marker.
  - **RAG** — collapsed "Advanced" disclosure: topK, chunkSize, chunkOverlap.
- "Reset to env default" link per field — submits `null` for that key.
- Save button POSTs the dirty subset, surfaces errors inline.

UI follows the v1.0.0 design system: card surfaces (`rounded-xl border-border-subtle bg-surface shadow-sm`), inputs/buttons per `DESIGN.md`.

---

## 9. Vision-OCR ingest pipeline

### 9.1 Dependencies

Bump `unpdf` to `^1.6.0` in `packages/rag/package.json` (current ^0.12.1 lacks `renderPageAsImage`). Add `@napi-rs/canvas@^0.1.x` to `packages/rag/package.json` for canvas-based cropping. Both ship prebuilt darwin-arm64 binaries.

`packages/rag/src/pdf.ts` adds a one-time configuration call:

```ts
import { configureUnPDF, getDocumentProxy, renderPageAsImage } from 'unpdf';

let pdfjsConfigured = false;
async function ensurePdfjs() {
  if (pdfjsConfigured) return;
  await configureUnPDF({ pdfjs: () => import('unpdf/pdfjs') });
  pdfjsConfigured = true;
}
```

This is the #1 stumbling block for `unpdf@^1`: `renderPageAsImage` requires the full pdfjs build, not the serverless one.

### 9.2 New module — `packages/rag/src/ingest-pdf.ts`

Public function:

```ts
export async function runIngestJob(documentId: string, opts: {
  settings: ResolvedSettings;
  embedder: Embedder;
  vision: VisionClient;
  onProgress?: (pagesDone: number, pagesTotal: number) => Promise<void>;
}): Promise<void>;
```

Flow:

1. Load document row (with `original_content`).
2. Update `ingest_status='rasterizing'`.
3. `await ensurePdfjs()`; `pdf = await getDocumentProxy(originalBytes)`.
4. Set `pages_total`.
5. For each page (semaphore concurrency 2):
   - `raster = await renderPageAsImage(originalBytes, n, { scale: 2.0 })` → ArrayBuffer.
   - `raster = resizeLongestEdge(raster, 1792)` (using `@napi-rs/canvas`).
   - **OCR call** to vision model — see §9.3.
   - **Figure-detect call** — see §9.4.
   - For each figure: crop with canvas, persist row in `document_images` (kind=`figure`), splice an `![figure-{idx}](asset:{uuid})` token into the page markdown at the position closest to the bbox center (paragraph-break heuristic — find the nearest blank line in the markdown buffer).
   - Insert `kind='page'` row with the resized PNG, no summary.
   - Update `pages_done`.
6. Update `ingest_status='embedding'`.
7. Run existing chunker over `combinedMarkdown` (with the asset-atomicity guard from §10).
8. For each chunk: `embedBatch`, also extract `image_ids` from chunk content via `/asset:([0-9a-f-]{36})/gi`, attach `page` (the source page of the first character).
9. Insert chunks. Update `image_ids` on each chunk row.
10. Embed each `document_images.summary` (one batched `embedBatch` call) and update `summary_embedding`.
11. Update `ingest_status='ready'`, set `extraction_method='vision'`.

Error handling: any throw transitions `ingest_status='failed'` and stores the message in `ingest_error`. Partial progress (chunks, images already inserted) is left in place — re-uploading replaces the document.

### 9.3 OCR call

`packages/rag/src/vision.ts` exports `createVisionClient({ baseUrl, model })`:

```ts
export async function ocrPage(client: VisionClient, png: Buffer): Promise<string> {
  const { text } = await generateText({
    model: client.model,
    temperature: 0.1,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: OCR_PROMPT },
        { type: 'image', image: png },
      ],
    }],
  });
  return text.trim();
}
```

`OCR_PROMPT` (in `packages/rag/src/prompts.ts`):

> Convert this page to clean GitHub-flavored Markdown. Preserve heading levels, lists, tables (use pipe syntax), and code blocks. Do not invent text that is not on the page. Do not add commentary, preamble, or trailing notes — output only the Markdown body.

Use the `ollama-ai-provider` already in the dep tree; vision support works through `messages` with `image` parts. The provider accepts `Buffer` directly.

### 9.4 Figure detection + crop

Second call per page:

```
You are given the same page image as above. List figures, charts, diagrams, photos,
or screenshots present on the page. For each, return a JSON array entry:
  { "label": "Figure 3" | "Chart" | "Diagram" | <best guess>,
    "bbox": [x, y, w, h],   // 0..1 page coordinates
    "caption": "<one tight sentence>" }
Return ONLY the JSON array. If there are no figures, return [].
```

Parse the JSON; on parse failure, log and skip (no figures for that page). For each figure:

- Pad bbox by 3% on every side (clamp 0..1).
- Crop the (already 1792-wide) page raster with `@napi-rs/canvas` `drawImage`, encode PNG with `toBuffer('image/png')`.
- Generate a UUID, insert into `document_images`.
- Run a third vision call **on the crop**: "Summarize this figure in 1–2 sentences for retrieval. Do not include the figure number." Store result as `summary`.

Markdown injection: append `\n\n![{label}](asset:{uuid})\n\n*{caption}*\n\n` after the OCR markdown produced for that page. (Bbox-position-aware splicing is a v1.1 polish.)

### 9.5 Asset-token atomicity

`packages/rag/src/chunker.ts` is recursive char-based and will happily split `![alt](asset:uuid)` mid-link. Mitigation:

- Insert each asset block flanked by `\n\n` so the existing `\n\n` separator preference rarely splits inside.
- Add a defensive post-pass: after `chunkText`, if any chunk ends mid-`asset:` token, merge it with the next chunk.

### 9.6 Status streaming

The upload route returns 202 + `{ documentId }`. Two ways for the UI to follow progress:

1. **Polling:** new `GET /api/documents/[id]/status` returns `{ status, pagesDone, pagesTotal, error }`. The Documents page polls every 2s for any document not in `'ready' | 'failed'`.
2. **SSE (deferred to v1.1):** `GET /api/documents/[id]/events`.

v1 ships polling.

---

## 10. Asset serving + chat changes

### 10.1 `GET /api/assets/[id]`

`apps/web/src/app/api/assets/[id]/route.ts`:

- Read `document_images` row by id.
- Stream bytea with `Content-Type: image/png`, `Cache-Control: public, max-age=31536000, immutable`, `ETag: "<id>"`.
- 404 if missing.

### 10.2 Retrieval changes

`packages/rag/src/retrieve.ts`:

- After the ANN query, if any returned chunk has non-empty `image_ids`, fan out a single `SELECT id, summary, page, document_id FROM document_images WHERE id = ANY($1)` and attach a `imageRefs: { id, summary, page }[]` field per result.

`RetrievalResult` in `packages/shared/src/schemas.ts` gets an optional `imageRefs?: { id: string; summary: string | null; page: number }[]`.

### 10.3 New: figure-only retrieval

`packages/rag/src/retrieve-figures.ts` adds:

```ts
export interface FigureHit {
  id: string;            // document_images.id
  documentId: string;
  source: string;        // documents.source
  title: string | null;
  page: number;
  summary: string;
  score: number;         // cosine similarity 0..1
}

export async function retrieveFigures(
  query: string,
  opts: { topK?: number; embedder: Embedder; sourceFilter?: string },
): Promise<FigureHit[]>;
```

Implementation: embed `query` with the same embedder used for chunks, run an HNSW cosine search against `document_images.summary_embedding`, join `documents` for `source`/`title`, return top-K (default 4). This is the **direct path** that guarantees a figure can be located by a question that only describes it.

### 10.4 Agent tools

The agent gains a third figure-aware tool alongside `search_kb`/`fetch_doc`/`list_sources`:

```ts
// packages/agent/src/tools.ts
findFigure: tool({
  description:
    "Find figures (charts, diagrams, photos, screenshots) in the knowledge base by what they show. " +
    "Use this whenever the user asks to see, show, or describe an image, figure, chart, diagram, " +
    "screenshot, or visual element. Returns figure refs that MUST be rendered inline as " +
    "![alt](asset:UUID) markdown in your reply.",
  parameters: z.object({
    query: z.string().min(2),
    topK: z.number().int().min(1).max(10).optional(),
    sourceFilter: z.string().optional(),
  }),
  execute: async ({ query, topK = 4, sourceFilter }) => {
    const hits = await retrieveFigures(query, { topK, sourceFilter, embedder: deps.embedder });
    return {
      figures: hits.map((h) => ({
        assetMarkdown: `![${h.title ?? 'figure'} (p.${h.page})](asset:${h.id})`,
        source: h.source,
        title: h.title,
        page: h.page,
        summary: h.summary,
        score: h.score,
      })),
    };
  },
}),
```

Returning `assetMarkdown` pre-baked (rather than just the UUID) makes "render this string verbatim" trivial for small models.

### 10.5 Agent system prompt

`packages/agent/src/prompts.ts` extends the existing prompt with:

> **Image rendering rules — MANDATORY**
>
> 1. If the user asks to **see, show, view, find, look at, describe, or compare** any **image, figure, chart, diagram, screenshot, photo, or visual** — call the `find_figure` tool first, before `search_kb`.
> 2. Whenever a tool result contains an `assetMarkdown` field or any retrieved chunk contains the literal token `asset:<uuid>` inline, copy that markdown into your reply **verbatim**. Do not paraphrase the URI, do not unwrap to text, do not write "(see figure 3)" instead. The UI only renders `<img>` tags from `![…](asset:UUID)` markdown.
> 3. After rendering an image, write one short sentence describing what it shows (drawn from the figure summary). Then continue your normal answer.
> 4. If `find_figure` returns no hits, say so plainly ("I couldn't find a figure matching that") rather than fabricating one.
>
> **Few-shot example**
>
> User: *"Show me the latency chart."*
>
> [tool: find_figure({ query: "latency chart" })] →
> `{ figures: [{ assetMarkdown: "![paper.pdf (p.7)](asset:7f2c…)", page: 7, summary: "Latency vs request size, log-log scale.", source: "paper.pdf" }] }`
>
> Assistant:
> ```
> Here is the latency chart from paper.pdf, page 7:
>
> ![paper.pdf (p.7)](asset:7f2c1e1a-aaaa-bbbb-cccc-1234567890ab)
>
> It plots latency against request size on a log–log scale. [paper.pdf:Latency by request size]
> ```

### 10.6 Server-side post-processing safety net

Small chat models (4–8B) sometimes drop image markdown despite explicit instructions. To make US-7/US-8 deterministic, the chat route post-processes the assistant's final text **before** flushing the SSE stream:

`apps/web/src/app/api/chat/route.ts`:

1. Use the AI SDK `onFinish` hook (or `streamText({ ..., onFinish })`) to capture (a) the final assistant text, (b) every tool call/result that occurred during the run.
2. Extract the union of figure UUIDs from:
   - `findFigure` tool results (`figures[].assetMarkdown` UUID component)
   - `searchKb` tool results (`results[].imageRefs[].id`)
3. Scan the assistant text for `asset:<uuid>` tokens already present (regex `/asset:([0-9a-f-]{36})/gi`).
4. If the **user's last message** matches the visual-intent regex `/\b(show|view|see|look at|display|render|figure|chart|diagram|screenshot|image|photo|picture)\b/i` AND there are figure UUIDs from tools that the assistant did NOT include, append:
   ```
   \n\n---\n**Related figure(s)**\n\n
   ![<title> (p.<page>)](asset:<uuid>)
   ```
   one per missing figure (cap at 3, ordered by tool-result order).
5. Stream the patched text. Implementation note: with `simulateStreaming: true` already enabled (per `agent.ts`), we own the streamed text and can patch the final tail before flush.

This is a **belt-and-suspenders** layer: prompt + tool design should already cover 95% of cases; the post-processor catches the long tail.

#### 10.6.1 Hard-fallback (third layer)

If, after the post-processor runs, the assistant text *still* contains zero `asset:<uuid>` tokens AND visual intent was detected AND figure UUIDs were available from tool results, **prepend** (not append) a single `![…](asset:UUID)` line for the top-ranked figure to the streamed message. This is the floor: under no condition does a clearly-visual user question end with a reply that has tool-retrieved figures but no inline image. Logged as `image_inject_reason='hard_fallback'` for telemetry; surfaced to the dev console in development mode.

#### 10.6.2 Streaming + final-pass implementation

The current chat path uses `simulateStreaming: true` (per `packages/agent/src/agent.ts`) — the AI SDK collects the full text and re-emits it as a fake stream. That gives us a single point to patch:

```ts
// apps/web/src/app/api/chat/route.ts
const result = await runAgent({ ... });

return result.toDataStreamResponse({
  // intercept final assistant text and rewrite before tokens flush
  experimental_transform: createImageGuaranteeTransform({
    userMessage,
    toolResults: result.toolResults,
  }),
});
```

`createImageGuaranteeTransform` is implemented in `apps/web/src/lib/image-guarantee.ts` and follows the AI SDK `TextStreamPart` transform contract. It buffers all `text-delta` parts, applies §10.6 + §10.6.1 to the concatenated text, and re-emits a single `text-delta` with the patched body before the `finish` part. Because `simulateStreaming` already collapses streaming into a single batch, this is lossless — no partial-render flicker.

### 10.7 Chat UI rewrite — guaranteed `<img>` rendering

`apps/web/src/components/chat.tsx` replaces the current `whitespace-pre-wrap` block with **`react-markdown@^9`** + `remark-gfm` so the model's markdown renders as headings, lists, tables, links, and images.

#### 10.7.1 The default-blocks-asset-URLs trap

`react-markdown@^9` ships a default `urlTransform` that **strips any URL not matching its safe-protocol allow-list** (`http`, `https`, `mailto`, `tel`, `irc`, etc.). `asset:UUID` is not on that list — without overriding `urlTransform`, every figure URL gets nulled out and **no `<img>` ever renders**, no matter what the model emits. This is the single highest-risk silent failure in the whole spec; it must be fixed in the same commit that introduces `react-markdown`.

```tsx
// apps/web/src/components/markdown.tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const ASSET_PREFIX = 'asset:';

function urlTransform(uri: string): string {
  if (uri.startsWith(ASSET_PREFIX)) {
    const id = uri.slice(ASSET_PREFIX.length);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return ''; // invalid UUID → drop
    return `/api/assets/${id}`;
  }
  // delegate everything else to react-markdown's default safelist
  return uri;
}

export function ChatMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={urlTransform}
      components={{
        img: ({ src, alt }) => (
          <a
            href={src ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="block my-3 max-w-full"
          >
            <img
              src={src}
              alt={alt ?? ''}
              loading="lazy"
              decoding="async"
              className="rounded-xl border border-border-subtle bg-surface shadow-sm max-h-[480px] max-w-full object-contain"
              onError={(e) => {
                // surface broken-asset state to the user, do not silently 404
                const img = e.currentTarget;
                img.replaceWith(Object.assign(document.createElement('span'), {
                  className: 'inline-flex items-center gap-1.5 text-xs text-danger',
                  textContent: `Failed to load image (${alt ?? 'asset'})`,
                }));
              }}
            />
          </a>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            {children}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
```

#### 10.7.2 Other rendering pitfalls — explicitly addressed

- **Streaming partial markdown.** While text streams in, the buffer may briefly contain `![alt](asset:1234` (no closing paren). `react-markdown` handles incomplete markdown gracefully — it renders the partial as text, not a broken `<img>`. Verified with a unit test that feeds the parser a half-token.
- **`next/image` does NOT apply.** We use a plain `<img>`, not `<Image>`. No `next.config.js` `images.remotePatterns` change needed; `/api/assets/...` is same-origin.
- **CSP / Strict-Transport.** No CSP is set today; if one is added later, ensure `img-src 'self'` covers `/api/assets/`.
- **Asset 404.** The `<img onError>` handler swaps the element for a small `text-danger` "Failed to load image (alt)" span so a stale UUID doesn't render as a silent broken-image icon.
- **GFM tables and code blocks** coexist with images — `remarkGfm` is needed for tables; without it, OCR'd tables render as raw pipes. Spec mandates `remarkGfm`.
- **`react-markdown` versus `MDXRemote`.** Do not adopt MDX here — we don't need component embedding, and MDX would require an extra build step.

#### 10.7.3 Asset endpoint must return image bytes correctly

The `/api/assets/[id]` route (§10.1) MUST set:

- `Content-Type` from the row (`image/png`, possibly `image/jpeg` later).
- `Content-Length` (browsers gate progressive rendering on it).
- `Cache-Control: public, max-age=31536000, immutable` — UUIDs are content-immutable.
- Body MUST be a `Buffer` / `Uint8Array`, not a base64 string. Verified with `curl -I` returning `Content-Type: image/png`.

#### 10.7.4 Render verification — automated

Add a Playwright (or Vitest + jsdom + @testing-library) test in `apps/web/src/__tests__/chat-render.test.tsx` that:

1. Mocks `useChat` to deliver an assistant message containing `![chart](asset:00000000-0000-0000-0000-000000000001)`.
2. Stubs `fetch('/api/assets/...')` to return a 1×1 PNG.
3. Asserts `screen.getByRole('img', { name: 'chart' })` exists and `img.src` ends with `/api/assets/00000000-0000-0000-0000-000000000001`.
4. Negative case: mocks an assistant message with `[bad](javascript:alert(1))` and asserts NO `<a>` with that href is rendered (URL transformer gates it).

This is the gating test for the "image will render in chat" requirement — it fails the build if any of: missing `urlTransform`, broken custom `img` component, missing `remarkGfm`, or a regression in the asset-prefix rewrite would silently break rendering.

**New deps in `apps/web/package.json`:** `react-markdown@^9`, `remark-gfm@^4`. Both pure-JS, ~50 KB gzipped together.

### 10.8 Document viewer

`apps/web/src/components/document-viewer.tsx` adds a third tab **"Pages"** that lists `document_images` with `kind='page'` (one card per page) and shows their figures as a small horizontal scroll under each page card. Pure read-only.

---

## 11. Phasing / milestones

Each phase ends in a green typecheck + `next build`. UI phases also get a manual smoke test with the dev server.

### Phase A — Schema + Settings (no behavior change)
A1. Add columns + tables in `schema.ts`; generate `0002_vision_ocr.sql`.
A2. Add `appSettings`, `documentImages`, the new chunk + document columns; run migrations.
A3. Implement `getSettings()` resolver + cache.
A4. Add `OLLAMA_VISION_MODEL` to env schema.
A5. Build `/api/settings`, `/api/ollama/tags` routes.
A6. Build `/settings` page; add Settings nav item to sidebar.

Exit criteria: settings page round-trips persisted overrides; existing chat/ingest flows still pass without using settings yet (env still wins because no overrides set).

### Phase B — Vision-OCR ingest path
B1. Bump `unpdf`, add `@napi-rs/canvas`. Wire `configureUnPDF`.
B2. Add `packages/rag/src/vision.ts` (vision client + OCR + figure-detect helpers).
B3. Add `packages/rag/src/ingest-pdf.ts`. Wire it from `apps/web/src/app/api/ingest/upload/route.ts` for `kind='pdf'`. Keep `extractPdfText` reachable as `extraction_method='text'` fallback for any PDF where vision fails after retry.
B4. Implement `/api/documents/[id]/status`. Wire polling on Documents page (status badge replaces static "indexed" pill).
B5. Implement `/api/assets/[id]`.
B6. Update retrieval + `RetrievalResult` shape (chunks join `document_images` for `imageRefs`).
B7. Add `retrieveFigures()` + figure HNSW index already created in Phase A migration.
B8. Add `find_figure` tool to the agent's `buildTools()`.

Exit criteria: a 5-page PDF with one chart end-to-end yields a Documents page showing `ready`; the document detail page shows page rasters + figure crops; a chat query "show me the chart" returns an inline image (rendered as `<img>` in the UI), AND a chat query "what does the latency chart show?" finds the figure even if the surrounding text doesn't say "latency".

### Phase C — Chat UX polish + image-answer guarantee
C1. Switch chat message rendering to `react-markdown@^9` + `remark-gfm` with the **`urlTransform` override** (§10.7.1), custom `<img>` component with `onError` fallback, and the `<a>` wrapper per §10.7.
C2. System-prompt addendum (image rendering rules + few-shot).
C3. **Server-side post-processor (§10.6)** — catch dropped image markdown and append a "Related figure(s)" block when the user's question signals visual intent.
C4. **Hard-fallback layer (§10.6.1)** — guarantee at least one inline image when visual intent is clear and tools returned figures.
C5. **Render-verification test (§10.7.4)** — Vitest + jsdom asserts an `<img>` element with `/api/assets/…` src actually appears in the DOM. Phase C is **not green** until this test passes.
C6. Add a "Pages" tab to the document viewer.
C7. Documents page: per-row inline progress bar driven by `pagesDone / pagesTotal`.

Exit criteria: the explicit prompts "show me the chart on page N" and "what does the architecture diagram look like?" each result in an `<img src="/api/assets/…">` element in the rendered DOM, verified by the automated test in C5 *and* a manual DevTools inspection.

### Phase D — Hardening
D1. Concurrency-2 semaphore + per-document mutex.
D2. Asset-token atomicity post-pass in chunker.
D3. Failure paths: bad PDF, vision model not pulled, malformed JSON from figure-detect, oversized image.
D4. Settings test-connection: surface per-model availability with copy-paste pull commands.
D5. Re-upload semantics: deleting a document cascades to `chunks` + `document_images` (already true via FK — verify).

---

## 12. Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `gemma3:4b` Metal flakiness on multi-image | medium | medium | one-image-per-call; pin Ollama ≥ 0.10; retry once on EOF |
| OCR latency for 50-page PDFs (5 min+) | high | high | async + status polling; concurrency cap = 2; surface progress |
| Chunker splits `asset:` mid-token | medium | medium | flanking `\n\n` + post-pass merge guard |
| Embed-model dim drift via settings | low | high | settings UI banner + server-side validation against `ollama show` if reachable |
| `unpdf@^1` vs serverless pdfjs build | high | high | `configureUnPDF({ pdfjs: () => import('unpdf/pdfjs') })` documented in vision.ts |
| Vision model returns invalid JSON in figure-detect | medium | low | parse guard, log, skip page's figures, OCR still wins |
| `react-markdown` XSS on attacker-controlled markdown | low (single-user) | low | URI transformer rejects non-`asset:`/non-http(s); skip raw HTML |
| DB bloat from page rasters | medium | medium | pages stored at 1792px PNG (~150 KB each); reconsider if a workspace exceeds 5 GB |
| AGPL contamination | n/a | high | mupdf disqualified; unpdf MIT only |
| Small chat model drops `![…](asset:UUID)` markdown despite system prompt | medium | high | dedicated `find_figure` tool returns pre-baked `assetMarkdown`; few-shot in prompt; server-side post-processor (§10.6) appends a "Related figure(s)" block when visual intent is detected and figure UUIDs from tool results are missing from the reply |
| `find_figure` returns wrong figure due to weak summary | medium | medium | summaries are vision-generated 1–2 sentences (§9.4) — much higher recall than naive alt-text; cap topK at 4; user can refine with `sourceFilter` |
| User asks for a figure but no PDF has been uploaded | low | low | tool returns empty array; system-prompt rule §10.5(4) says the assistant must say so plainly |

---

## 13. Test plan

### Unit
- `packages/rag/src/__tests__/asset-tokens.test.ts` — chunker keeps `![…](asset:UUID)` intact.
- `packages/rag/src/__tests__/vision.test.ts` — OCR + figure-detect mocked Ollama responses parse correctly.
- `packages/db/src/__tests__/settings.test.ts` — `getSettings()` overlays env behavior; cache invalidation.
- `apps/web/src/__tests__/visual-intent.test.ts` — the visual-intent regex used by the post-processor matches "show me", "what does X look like", "the diagram", "figure 3", "screenshot of Y" and does NOT match neutral questions ("explain how X works", "what is the runtime complexity").
- `apps/web/src/__tests__/image-postprocess.test.ts` — given a fixture of (user message, tool calls, assistant text), confirms the post-processor: (a) leaves text alone when the assistant already included the asset markdown, (b) appends a "Related figure(s)" block when visual intent is true AND tool results contained UUIDs the assistant dropped, (c) does nothing on neutral questions, (d) caps additions at 3.

### Integration (against a live Ollama)
- A 1-page text PDF (no figures) ingests in <30 s, ends `ready`, chunks contain no `asset:` tokens.
- A 1-page PDF with one chart ingests, `document_images` has 1 page row + 1 figure row.
- **Image-answer guarantee (US-7)**: after ingesting a 5-page PDF with three figures, sending the chat prompt "show me the chart on page 4" results in a final assistant message whose markdown contains `![…](asset:<uuid>)` matching the page-4 figure's UUID. Repeat with `find_figure` mocked to fail → confirm post-processor still appends the figure (because the chunk-side `imageRefs` provides the UUID).
- **Image-answer guarantee (US-8)**: a query phrased as "what does the architecture diagram look like?" against a PDF whose page-text never says "architecture" but whose figure summary does, surfaces the matching `asset:<uuid>` inline. Verifies that `retrieveFigures()` finds the figure via summary-embedding similarity.
- A 50-page paper ingests, status transitions queued → rasterizing → ocr → embedding → ready, `pagesDone` increments monotonically.
- Killing the process mid-ingest leaves a row with status='failed' on next visit (or stuck — manual cleanup is acceptable for v1).

### Manual UI smoke
- Upload PDF, watch `/documents` list show progress bar.
- Open document detail, see "Pages" tab with rasters + figure crops.
- Ask "show me the chart" → assistant reply renders `<img src="/api/assets/...">` (verify in DevTools, not just text).
- Ask "what does the diagram on page 2 show?" → image renders + sentence describing it appears.
- Ask a neutral non-visual question on the same doc → no spurious figures injected.
- Open `/settings`, change vision model, click Test connection, see availability.
- Reset to env default, save, confirm row is null.

---

## 14. Estimated scope

| Phase | Files touched | New files | Est. LOC | Est. hours |
|---|---|---|---|---|
| A — Settings | ~8 | 3 (settings page, API, resolver) | ~600 | 4–6 |
| B — Ingest | ~12 | 4 (ingest-pdf, vision, prompts, status route, assets route) | ~900 | 8–12 |
| C — Chat UX | ~5 | 0 | ~250 | 2–3 |
| D — Hardening | ~6 | 1 (sema util) | ~250 | 2–3 |

Total: ~2 working days for a focused implementer; ~1 day if the model-call latency on the dev box doesn't dominate the loop.

---

## 15. Open questions for sign-off

1. Should the ingest job be cancellable (Documents page "Cancel" button) in v1, or is "fail = re-upload" sufficient? *Recommend: deferred to v1.1.*
2. Should `/settings` allow toggling **off** the vision pipeline per-upload (legacy text-only), or always use vision for PDFs? *Recommend: always vision; the text fallback only fires when vision throws.*
3. Should `kind='page'` rasters be stored eagerly or lazily? Eager doubles the storage but powers the document viewer "Pages" tab without a re-rasterize. *Recommend: eager — storage is cheap and previews must be fast.*
4. Is a one-line CHANGELOG sufficient release-notes coverage, or should we generate a user-facing blurb?
5. **Image-injection aggressiveness.** The post-processor (§10.6) only fires when the user's last message matches the visual-intent regex. Should it also fire when the assistant explicitly *names* a figure ("Figure 3 shows…") in its reply but doesn't render it? *Recommend: yes, add a second trigger that scans the assistant text for `(?:figure|chart|diagram|screenshot)\s+\d+` and matches against retrieved figure pages. Implement as part of Phase C if a manual smoke test shows the rule is needed; otherwise defer.*
6. **Lightbox UX.** Clicking an inline image currently opens the asset URL in a new tab. Worth building an in-page lightbox now (zoom, pan, prev/next within reply)? *Recommend: defer to v1.1 — single-image new-tab is fine for a local-first tool.*

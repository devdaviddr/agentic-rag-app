# Agentic RAG

A local-first agentic RAG application that turns your PDFs into a searchable, image-aware knowledge base. The chat agent decides when to retrieve, cites its sources, and renders matching figures inline.

> Read the full design + flow in **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

**Stack:** Next.js 15 · React 19 · TypeScript · Tailwind v4 · Postgres + pgvector · Ollama (chat + embeddings + vision) · Vercel AI SDK · Drizzle ORM · Docker Compose · pnpm workspaces.

---

## Highlights

- **Vision-OCR PDF ingest** — every page is rasterized and sent to a local vision model (`gemma3:4b` by default) which returns clean Markdown plus bounding-boxed figures. Crops are summarized, embedded, and made searchable alongside text chunks.
- **Image-aware chat** — the agent has a dedicated `findFigure` tool searching figure-summary embeddings directly. Replies render the matching figure inline (`<img src="/api/assets/...">`); a three-layer guarantee (system prompt + post-processor + hard fallback) ensures the image actually shows up.
- **Settings page** — change Ollama base URL, chat / embed / vision models, temperature, and RAG knobs at runtime. Model fields are dropdowns auto-populated from `/api/tags`. Database overrides win over `.env` defaults.
- **Modern light UI** — sticky topbar + sidebar, generous whitespace, indigo accent, `react-markdown` + GFM in the chat.
- **Async ingest with progress** — uploads return `202` immediately and run via Next 15 `after()`. The Documents page polls `/api/documents/[id]/status` and shows a progress bar.
- **Local-first by default** — Postgres runs in Compose; Ollama lives wherever you point it (LAN, localhost, or remote). No third-party data exfiltration.

---

## Repository layout

```
apps/
  web/                    Next.js 15 app — UI + API routes + Vitest tests
packages/
  shared/                 zod schemas, env loader, ResolvedSettings type
  db/                     Drizzle schema + queries + migrations
  rag/                    chunker, embedder, ingest, retrieve, vision, raster
  agent/                  Vercel AI SDK agent + tools (search_kb, find_figure, ...)
docker/postgres/          DB init SQL (pgvector + pg_trgm extensions)
scripts/                  dev helpers (e.g. ollama-pull.sh)
spec/1.0.0/               design contract for the v1.0.0 vision-OCR feature
ARCHITECTURE.md           system architecture + ASCII diagram
```

---

## Quickstart

### 1. Prerequisites

- Docker Desktop (or compatible) with Compose v2
- Node.js ≥ 22 (the bundled `unpdf` pdfjs uses `Promise.try`; a polyfill ships in `@app/rag` for older runtimes)
- pnpm ≥ 10 (`corepack enable && corepack prepare pnpm@latest --activate`)
- Ollama running somewhere reachable, with at least these tags pulled:
  - chat: `llama3.1:8b` (or any chat model)
  - embed: `nomic-embed-text`
  - vision: `gemma3:4b` (or any multimodal model)

### 2. Bootstrap

```bash
git clone <repo-url> agentic-rag-app
cd agentic-rag-app
cp .env.example .env       # then edit OLLAMA_BASE_URL if Ollama is remote
pnpm install
```

### 3. Start the stack

```bash
docker compose up -d --build
```

Brings up:

1. `postgres` (pgvector/pg16) with `vector` + `pg_trgm`
2. `migrate` — applies Drizzle migrations, then exits
3. `web` — Next.js, listening on http://localhost:3000

The `web` service waits for `migrate` to complete, so the app is functional the moment it starts accepting connections.

> **Ollama is intentionally NOT in the Compose stack.** Run it on the host or a LAN box and point `OLLAMA_BASE_URL` at it. This avoids container-on-container GPU acrobatics and lets you share one Ollama across projects.

### 4. Open the app

http://localhost:3000

- **Chat** (`/`) — ask questions; the agent retrieves and cites.
- **Documents** (`/documents`) — drag-and-drop upload (`txt` / `md` / `pdf`), live ingest progress, per-doc detail with original / chunks / pages tabs.
- **Settings** (`/settings`) — pick models, set the Ollama URL, tune RAG.

### 5. Ingest a PDF

```bash
curl -X POST http://localhost:3000/api/ingest/upload \
  -F "file=@./paper.pdf"
# -> 202 {"documentId":"...","kind":"pdf","queued":true}
```

Then poll status (or just watch the Documents page):

```bash
DOC=...   # documentId from the response
curl -s http://localhost:3000/api/documents/$DOC/status | jq
```

Once `status: "ready"`, ask the chat: *"Show me the chart on page 2"* — the assistant calls `findFigure`, finds the matching figure, and renders it inline.

### Local-dev variant (host-side Next, faster inner loop)

```bash
docker compose up -d postgres migrate
pnpm dev   # http://localhost:3000
```

---

## Common scripts

| Command                | What it does                                        |
| ---------------------- | --------------------------------------------------- |
| `pnpm dev`             | Run Next dev server (host-side)                     |
| `pnpm build`           | Build all workspace packages                        |
| `pnpm typecheck`       | TS check across the workspace                       |
| `pnpm lint`            | Lint all packages                                   |
| `pnpm format`          | Prettier write across the repo                      |
| `pnpm test`            | Run vitest in `@app/web` and `@app/rag`             |
| `pnpm stack:up`        | `docker compose up -d`                              |
| `pnpm stack:down`      | Tear down the stack                                 |
| `pnpm db:migrate`      | Apply Drizzle migrations                            |
| `pnpm db:studio`       | Open drizzle-kit studio                             |
| `pnpm ollama:pull`     | Pull configured chat + embedding + vision models    |

---

## Environment variables

The `.env` file is the **bootstrap default**. The `app_settings` row in Postgres overlays it — set values via `/settings` and they persist without restart.

| Var                  | Default                                   | Settings page? |
| -------------------- | ----------------------------------------- | -------------- |
| `DATABASE_URL`       | `postgres://rag:rag@localhost:5432/rag`   | no (env-only)  |
| `OLLAMA_BASE_URL`    | `http://localhost:11434`                  | yes            |
| `OLLAMA_CHAT_MODEL`  | `llama3.1:8b`                             | yes            |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text`                        | yes            |
| `OLLAMA_VISION_MODEL`| `gemma3:4b`                               | yes            |
| `EMBEDDING_DIM`      | `768` (must match the embed model)        | no (env-only)  |
| `RAG_CHUNK_SIZE`     | `800`                                     | yes (advanced) |
| `RAG_CHUNK_OVERLAP`  | `120`                                     | yes (advanced) |
| `RAG_TOP_K`          | `6`                                       | yes (advanced) |

> Switching `OLLAMA_EMBED_MODEL` to one with a different vector size requires a re-embed (re-upload affected docs). The settings page warns inline.

---

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — components, data flow, ingest + chat sequence, ASCII diagram
- `spec/1.0.0/pdfupload.md` — design contract for the vision-OCR + image-render feature
- `CHANGELOG.md` — version history
- `CONTRIBUTING.md` — branching model + commit conventions

---

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Branches follow a gitflow-ish model: `feature/*` → `release-x.y.z` → `main`.

## License

Apache-2.0 — see [`LICENSE`](./LICENSE).

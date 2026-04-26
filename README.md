# Agentic RAG

A local-first, full-stack agentic RAG application. The agent decides when to
retrieve from a private knowledge base and cites its sources.

**Stack:** Next.js 15 · TypeScript · Postgres + pgvector · Ollama (chat +
embeddings) · Vercel AI SDK · Drizzle ORM · Docker Compose · pnpm workspaces.

> LangChain is intentionally not a dependency. The AI SDK + a thin RAG layer
> covers v1; we'll add LangChain/LangGraph only if branching agent workflows
> or long-tail document loaders justify it. See `spec/spec-1.0.0/00-overview.md`.

---

## Repository layout

```
apps/
  web/                Next.js 15 app (UI + API routes)
packages/
  shared/             zod schemas, env loader, shared types
  db/                 Drizzle schema, client, migrations
  rag/                chunker, embedder, ingest, retrieve
  agent/              AI SDK agent loop + tools + prompts
docker/postgres/      DB init SQL (pgvector extension)
scripts/              dev helpers
spec/spec-1.0.0/      design docs for v1.0.0 (start at 00-overview.md)
```

---

## Quickstart

### 1. Prerequisites
- Docker Desktop (or compatible) with Compose v2
- Node.js ≥ 20.11
- pnpm ≥ 10 (`corepack enable && corepack prepare pnpm@latest --activate`)

### 2. Bootstrap

```bash
git clone <repo-url> agentic-rag-app
cd agentic-rag-app
cp .env.example .env
pnpm install
```

### 3. Generate the initial migration (one-time)

On a fresh clone, generate the SQL Drizzle will apply at startup:

```bash
pnpm --filter @app/db generate    # writes packages/db/drizzle/*.sql
```

Commit the generated files. Re-run after any change to `packages/db/src/schema.ts`.

### 4. Start the full stack

```bash
docker compose up --build
```

That brings up, in order:

1. `postgres` (pgvector/pg16) with `vector` + `pg_trgm` extensions
2. `ollama` daemon
3. `ollama-init` — pulls `OLLAMA_CHAT_MODEL` + `OLLAMA_EMBED_MODEL` (first
   run only takes a while; subsequent runs are no-ops)
4. `migrate` — applies Drizzle migrations against postgres, then exits
5. `web` — Next.js, listening on http://localhost:3000

The `web` service waits for both `migrate` and `ollama-init` to finish
successfully, so the app is functional the moment it starts accepting
connections.

### Local-dev variant (faster inner loop)

If you'd rather run Next on the host with hot reload:

```bash
docker compose up -d postgres ollama ollama-init migrate
pnpm dev   # http://localhost:3000
```

### 5. Ingest a document

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H 'content-type: application/json' \
  -d '{
    "source": "demo/readme",
    "title": "Project README",
    "content": "Agentic RAG is a local-first chat app that grounds answers in your own documents."
  }'
```

Then ask the chat UI: *"What is Agentic RAG?"* — the agent should call
`search_kb` and cite `[demo/readme:Project README]`.

---

## Common scripts

| Command                | What it does                                        |
| ---------------------- | --------------------------------------------------- |
| `pnpm dev`             | Run Next dev server                                 |
| `pnpm build`           | Build all workspace packages                        |
| `pnpm typecheck`       | TS check across the workspace                       |
| `pnpm lint`            | Lint all packages                                   |
| `pnpm format`          | Prettier write across the repo                      |
| `pnpm stack:up`        | `docker compose up -d` (full stack)                 |
| `pnpm stack:down`      | Tear down the stack                                 |
| `pnpm db:migrate`      | Apply Drizzle migrations                            |
| `pnpm db:studio`       | Open drizzle-kit studio                             |
| `pnpm ollama:pull`     | Pull configured chat + embedding models             |

---

## Environment variables

See `.env.example` for the full list. Required at minimum:

| Var                  | Default                                   |
| -------------------- | ----------------------------------------- |
| `DATABASE_URL`       | `postgres://rag:rag@localhost:5432/rag`   |
| `OLLAMA_BASE_URL`    | `http://localhost:11434`                  |
| `OLLAMA_CHAT_MODEL`  | `llama3.1:8b`                             |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text`                        |
| `EMBEDDING_DIM`      | `768` (must match the embed model)        |

---

## Documentation

- `spec/spec-1.0.0/00-overview.md` — goals, non-goals, stack rationale
- `spec/spec-1.0.0/01-architecture.md` — component map and request lifecycle
- `spec/spec-1.0.0/02-data-model.md` — tables, indexes, embedding dimension policy
- `spec/spec-1.0.0/03-agent-design.md` — tools, prompt principles, guardrails
- `spec/spec-1.0.0/04-api.md` — HTTP endpoints
- `spec/spec-1.0.0/05-roadmap.md` — what's next

Future versions get their own `spec/spec-<x.y.z>/` directory; older specs are
preserved as historical record.

---

## Contributing

See `CONTRIBUTING.md` for the gitflow branching model, commit conventions,
and PR checklist.

## License

Apache-2.0 — see `LICENSE`.

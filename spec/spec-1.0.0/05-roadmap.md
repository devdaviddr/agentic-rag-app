# Roadmap

## v0.1 — Skeleton (this commit)
- [x] Monorepo (pnpm workspaces, TS project refs)
- [x] Postgres+pgvector + Ollama via Docker Compose
- [x] Drizzle schema + HNSW index
- [x] RAG primitives: chunk, embed, ingest, retrieve
- [x] Agent loop with 3 tools (Vercel AI SDK)
- [x] Next.js 15 chat UI + ingest endpoint
- [x] Spec docs + gitflow + CI

## v0.2 — Usable demo
- [ ] Drizzle migration generated + checked in
- [ ] File upload UI (md / txt / pdf via `unpdf`)
- [ ] Citations rendered as collapsible cards in chat
- [ ] Vitest smoke tests for chunker, retrieve, ingest tx
- [ ] Playwright happy-path test (ingest → ask → cite)

## v0.3 — Quality
- [ ] Hybrid retrieval (HNSW + `pg_trgm` BM-ish merge)
- [ ] Reranker pass (cross-encoder via Ollama or transformers.js)
- [ ] Per-source filtering UI
- [ ] Run trace persistence + `/runs/:id` debug view

## v0.4 — Multi-user
- [ ] Auth (Auth.js) + per-user namespaces
- [ ] Conversations / messages persistence
- [ ] Share-a-conversation read links

## Beyond
- LangGraph if branching workflows emerge.
- Optional cloud LLM provider behind same `agent` interface.
- Self-host deploy guide (Fly.io / Coolify / bare metal).

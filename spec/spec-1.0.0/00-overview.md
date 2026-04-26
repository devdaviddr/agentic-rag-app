# Agentic RAG — Project Overview

## Goal
Build a local-first agentic RAG application: a Next.js chat UI backed by an
LLM agent that retrieves grounded answers from a private knowledge base. The
stack runs end-to-end on a single developer machine via Docker.

## Non-goals (v1)
- Multi-tenant auth / orgs
- Cloud-hosted LLM providers (OpenAI, Anthropic) — hooks left open, not wired
- Realtime collaboration
- Fine-tuning models

## Stack
| Layer            | Choice                                      | Why                                       |
| ---------------- | ------------------------------------------- | ----------------------------------------- |
| Framework        | Next.js 15 (App Router, Server Components)  | Streaming, edge-ready, single deploy unit |
| Language         | TypeScript (strict)                         | Shared types across server/client/agent   |
| LLM runtime      | Ollama (chat + embeddings)                  | Local, no API keys, GPU/CPU friendly      |
| Agent / SDK      | Vercel AI SDK (`ai` + `ollama-ai-provider`) | First-class streaming, tools, multi-step  |
| Vector store     | Postgres + pgvector + HNSW                  | Single DB, ANN, transactional ingest      |
| ORM / migrations | Drizzle ORM + drizzle-kit                   | Type-safe, SQL-first, plays well with pg  |
| Container        | Docker Compose                              | Reproducible local stack                  |
| Pkg manager      | pnpm workspaces (catalog versions)          | Fast, deterministic, monorepo-native      |

## When LangChain?
LangChain is intentionally **not** a dependency in v1. Drop it in only if/when
we need: production-grade document loaders for many formats, prebuilt agent
patterns we don't want to maintain, or graph orchestration (LangGraph). For
chunking + embed + retrieve + tool-calling, the AI SDK + a thin RAG layer is
sufficient and has lower lock-in.

## High-level flow
1. **Ingest**: `POST /api/ingest` → chunk → embed (Ollama) → write `documents`
   + `chunks` (with vector) in a single transaction.
2. **Chat**: `POST /api/chat` → AI SDK `streamText` with tools
   (`search_kb`, `fetch_doc`, `list_sources`) → model decides when to retrieve
   → response streams back to the UI.
3. **Retrieve**: cosine ANN over `chunks.embedding` (HNSW index), joined to
   `documents` for source attribution.

See `01-architecture.md` for component diagrams and `02-data-model.md`
for the schema.

# API

All routes live under `apps/web/src/app/api/`. Node runtime (not edge),
because `postgres-js` and `ollama-ai-provider` need Node APIs.

## `POST /api/ingest`
Ingest a document into the KB.

Request:
```json
{
  "source": "docs/handbook.md",
  "title": "Engineering Handbook",
  "content": "# Intro\n…",
  "metadata": { "author": "team" }
}
```

Response `201`:
```json
{ "documentId": "…uuid…", "chunkCount": 42 }
```

Errors: `400` with zod issue list when validation fails.

## `POST /api/chat`
Stream an agent response. Body matches the AI SDK `useChat` payload:
```json
{ "messages": [{ "role": "user", "content": "What is X?" }] }
```

Response: `text/event-stream` data stream consumed by `useChat` on the
client. Includes assistant deltas, tool calls, and tool results.

## Future routes
| Path                   | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `GET  /api/sources`    | UI listing of `list_sources`             |
| `DELETE /api/documents/:id` | Remove a document and its chunks    |
| `POST /api/reindex`    | Re-embed all chunks (model swap)         |

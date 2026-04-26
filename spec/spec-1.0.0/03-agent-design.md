# Agent Design

## Loop
The agent uses the AI SDK `streamText` loop with `maxSteps` (default 5):
each step the model can either emit text or call a tool. Tool results are
fed back in as `tool` messages and the loop continues until the model
emits a terminal text response or the cap is hit.

## Tools

### `search_kb`
Vector ANN over the chunk store.
```
input:  { query: string, topK?: number, sourceFilter?: string }
output: { results: RetrievalResult[] }   // chunkId, score, source, content
```
Cosine similarity normalized to `1 - distance` for intuitive ranking.

### `fetch_doc`
Get the full reassembled content of one document.
```
input:  { documentId: uuid }
output: { id, source, title, content }   // chunks joined in ordinal order
```
Use case: model finds a strong hit but wants surrounding context.

### `list_sources`
Inventory the KB.
```
input:  { limit?: number }
output: { sources: [{ source, document_count, chunk_count }] }
```
Use case: open-ended "what do you know about?" or scoping a search.

## System prompt principles
1. Tool-first for non-trivial questions — don't answer from priors.
2. Cite as `[source:title]` inline.
3. Refuse to invent facts when retrieval is empty.
4. Be concise; bullets for multi-fact answers.

See `packages/agent/src/prompts.ts` for the live text.

## Failure modes & guardrails
| Failure                        | Mitigation                                              |
| ------------------------------ | ------------------------------------------------------- |
| Model loops on tool calls      | `maxSteps` cap (default 5)                              |
| Empty retrieval                | Prompt forbids fabrication; model says "I don't know"   |
| Long documents in `fetch_doc`  | Cap content size (TODO v1.1) or summarize on the way out |
| Off-topic / irrelevant queries | No special handling; user can rephrase                  |

## Observability (planned)
- Log every tool call (name, args, result size, latency).
- Persist agent runs to a `runs` table for replay/debugging.
- Surface citation chunks back to the UI as expandable cards.

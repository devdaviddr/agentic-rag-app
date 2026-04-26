#!/usr/bin/env bash
# Pull the chat + embedding models into the running Ollama container.
# Usage: pnpm ollama:pull
set -euo pipefail

CONTAINER="${OLLAMA_CONTAINER:-rag-ollama}"
CHAT_MODEL="${OLLAMA_CHAT_MODEL:-llama3.1:8b}"
EMBED_MODEL="${OLLAMA_EMBED_MODEL:-nomic-embed-text}"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "Ollama container '${CONTAINER}' is not running. Run: pnpm stack:up" >&2
  exit 1
fi

echo "Pulling chat model: ${CHAT_MODEL}"
docker exec -it "${CONTAINER}" ollama pull "${CHAT_MODEL}"

echo "Pulling embedding model: ${EMBED_MODEL}"
docker exec -it "${CONTAINER}" ollama pull "${EMBED_MODEL}"

echo "Done. Models available:"
docker exec -it "${CONTAINER}" ollama list

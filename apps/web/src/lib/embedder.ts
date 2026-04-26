import { createEmbedder, type Embedder } from '@app/rag';
import { getEnv } from './env.js';

let _embedder: Embedder | null = null;

export function getEmbedder(): Embedder {
  if (!_embedder) {
    const env = getEnv();
    _embedder = createEmbedder({
      baseURL: env.OLLAMA_BASE_URL,
      model: env.OLLAMA_EMBED_MODEL,
    });
  }
  return _embedder;
}

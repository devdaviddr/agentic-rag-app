import { createEmbedder } from '@app/rag';
import { env } from './env.js';

export const embedder = createEmbedder({
  baseURL: env.OLLAMA_BASE_URL,
  model: env.OLLAMA_EMBED_MODEL,
});

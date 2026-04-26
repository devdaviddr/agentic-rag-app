import { createOllama } from 'ollama-ai-provider';
import { embed, embedMany } from 'ai';

export interface EmbeddingClientOptions {
  baseURL: string;
  model: string;
}

export function createEmbedder(opts: EmbeddingClientOptions) {
  const ollama = createOllama({ baseURL: normalizeOllamaBaseURL(opts.baseURL) });
  const model = ollama.embedding(opts.model);

  return {
    async embedOne(text: string): Promise<number[]> {
      const { embedding } = await embed({ model, value: text });
      return embedding;
    },
    async embedBatch(values: string[]): Promise<number[][]> {
      if (values.length === 0) return [];
      const { embeddings } = await embedMany({ model, values });
      return embeddings;
    },
  };
}

export type Embedder = ReturnType<typeof createEmbedder>;

/**
 * `ollama-ai-provider` expects the base URL to point at Ollama's `/api`
 * prefix (its default is `http://localhost:11434/api`). Accept either form
 * from env and normalize so callers can pass the bare host.
 */
export function normalizeOllamaBaseURL(baseURL: string): string {
  const trimmed = baseURL.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

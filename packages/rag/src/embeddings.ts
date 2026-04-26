import { createOllama } from 'ollama-ai-provider';
import { embed, embedMany } from 'ai';

export interface EmbeddingClientOptions {
  baseURL: string;
  model: string;
}

export function createEmbedder(opts: EmbeddingClientOptions) {
  const ollama = createOllama({ baseURL: opts.baseURL });
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

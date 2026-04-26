import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_CHAT_MODEL: z.string().default('llama3.1:8b'),
  OLLAMA_EMBED_MODEL: z.string().default('nomic-embed-text'),
  OLLAMA_VISION_MODEL: z.string().default('gemma3:4b'),
  EMBEDDING_DIM: z.coerce.number().int().positive().default(768),
  RAG_CHUNK_SIZE: z.coerce.number().int().positive().default(800),
  RAG_CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(120),
  RAG_TOP_K: z.coerce.number().int().positive().default(6),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  cached = parsed.data;
  return cached;
}

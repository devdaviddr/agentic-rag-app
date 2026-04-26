import { NextRequest } from 'next/server';
import { z } from 'zod';
import { runAgent } from '@app/agent';
import { getEnv } from '@/lib/env';
import { getEmbedder } from '@/lib/embedder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant']),
      content: z.string(),
    }),
  ),
});

export async function POST(req: NextRequest) {
  const env = getEnv();
  const embedder = getEmbedder();
  const body = BodySchema.parse(await req.json());

  const result = runAgent({
    baseURL: env.OLLAMA_BASE_URL,
    chatModel: env.OLLAMA_CHAT_MODEL,
    messages: body.messages,
    toolDeps: { embedder, defaultTopK: env.RAG_TOP_K },
  });

  return result.toDataStreamResponse();
}

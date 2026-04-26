import { NextRequest, NextResponse } from 'next/server';
import { IngestRequestSchema } from '@app/shared';
import { ingestDocument } from '@app/rag';
import { getEnv } from '@/lib/env';
import { getEmbedder } from '@/lib/embedder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const parsed = IngestRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const env = getEnv();
  const embedder = getEmbedder();

  const result = await ingestDocument(parsed.data, {
    chunkSize: env.RAG_CHUNK_SIZE,
    chunkOverlap: env.RAG_CHUNK_OVERLAP,
    embedder,
  });

  return NextResponse.json(result, { status: 201 });
}

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { listChunksForDocument } from '@app/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const parsed = ParamsSchema.safeParse(await ctx.params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const includeEmbedding = req.nextUrl.searchParams.get('include') === 'embedding';
  const chunks = await listChunksForDocument(parsed.data.id, { includeEmbedding });
  return NextResponse.json({ chunks });
}

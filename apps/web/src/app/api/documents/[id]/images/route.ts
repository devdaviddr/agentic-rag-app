import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, asc } from 'drizzle-orm';
import { getDb, schema } from '@app/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const parsed = ParamsSchema.safeParse(await ctx.params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const db = getDb();
  const rows = await db
    .select({
      id: schema.documentImages.id,
      kind: schema.documentImages.kind,
      page: schema.documentImages.page,
      ordinal: schema.documentImages.ordinal,
      mimeType: schema.documentImages.mimeType,
      width: schema.documentImages.width,
      height: schema.documentImages.height,
      summary: schema.documentImages.summary,
    })
    .from(schema.documentImages)
    .where(eq(schema.documentImages.documentId, parsed.data.id))
    .orderBy(asc(schema.documentImages.page), asc(schema.documentImages.ordinal));

  return NextResponse.json({ images: rows });
}

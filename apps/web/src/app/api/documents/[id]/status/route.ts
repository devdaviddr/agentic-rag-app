import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
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
  const [row] = await db
    .select({
      id: schema.documents.id,
      ingestStatus: schema.documents.ingestStatus,
      ingestError: schema.documents.ingestError,
      pagesDone: schema.documents.pagesDone,
      pagesTotal: schema.documents.pagesTotal,
      extractionMethod: schema.documents.extractionMethod,
    })
    .from(schema.documents)
    .where(eq(schema.documents.id, parsed.data.id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    status: row.ingestStatus,
    pagesDone: row.pagesDone ?? 0,
    pagesTotal: row.pagesTotal ?? null,
    error: row.ingestError ?? null,
    extractionMethod: row.extractionMethod ?? null,
  });
}

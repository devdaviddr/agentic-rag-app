import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteDocument } from '@app/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const parsed = ParamsSchema.safeParse(await ctx.params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const deletedId = await deleteDocument(parsed.data.id);
  if (!deletedId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}

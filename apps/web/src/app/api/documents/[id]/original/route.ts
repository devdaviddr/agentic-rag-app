import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDocumentOriginal } from '@app/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const parsed = ParamsSchema.safeParse(await ctx.params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const doc = await getDocumentOriginal(parsed.data.id);
  if (!doc) {
    return NextResponse.json(
      { error: 'No original content stored for this document' },
      { status: 404 },
    );
  }
  const disposition = req.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline';
  // Copy into a freshly-allocated Uint8Array so its underlying buffer is
  // a plain ArrayBuffer (not ArrayBufferLike, which can be SharedArrayBuffer).
  // Newer @types/node + lib.dom.d.ts reject the latter as a BlobPart.
  const fresh = new Uint8Array(doc.bytes.byteLength);
  fresh.set(doc.bytes);
  const body = new Blob([fresh], { type: doc.mimeType });
  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': doc.mimeType,
      'content-length': String(doc.bytes.byteLength),
      'content-disposition': `${disposition}; filename="${encodeURIComponent(doc.filename)}"`,
      'cache-control': 'private, max-age=0, must-revalidate',
    },
  });
}

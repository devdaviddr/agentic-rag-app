import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@app/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// D3e: explicit UUID-shape check before any DB work. 400 with a stable error
// code so the chat UI's <img onError> path doesn't have to disambiguate
// "404 missing row" from "client built a bad URL".
const UUID_RE = /^[0-9a-f-]{36}$/i;
const ParamsSchema = z.object({ id: z.string().regex(UUID_RE) });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }
  const parsed = ParamsSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db
    .select({
      id: schema.documentImages.id,
      mimeType: schema.documentImages.mimeType,
      bytes: schema.documentImages.bytes,
    })
    .from(schema.documentImages)
    .where(eq(schema.documentImages.id, parsed.data.id))
    .limit(1);

  if (!row) {
    return new NextResponse(null, { status: 404 });
  }

  const buf = Buffer.isBuffer(row.bytes)
    ? row.bytes
    : Buffer.from(row.bytes as unknown as Uint8Array);

  // Wrap into a fresh Uint8Array (plain ArrayBuffer) → Blob, the way
  // /api/documents/[id]/original does, so newer @types/node + lib.dom
  // accept it as a BlobPart. Body must be raw bytes, not base64.
  const fresh = new Uint8Array(buf.byteLength);
  fresh.set(buf);
  const mime = row.mimeType ?? 'image/png';
  const body = new Blob([fresh], { type: mime });

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(buf.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: `"${row.id}"`,
    },
  });
}

import { NextResponse } from 'next/server';
import { listDocuments } from '@app/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const documents = await listDocuments();
  return NextResponse.json({
    documents: documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
  });
}

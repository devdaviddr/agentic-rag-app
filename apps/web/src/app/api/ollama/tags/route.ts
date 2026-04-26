import { NextRequest, NextResponse } from 'next/server';
import { normalizeOllamaBaseURL } from '@app/rag';
import { getSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const override = req.nextUrl.searchParams.get('baseUrl');
  let baseUrl: string;
  if (override) {
    try {
      new URL(override);
      baseUrl = override;
    } catch {
      return NextResponse.json({ error: 'invalid baseUrl' }, { status: 400 });
    }
  } else {
    baseUrl = (await getSettings()).ollamaBaseUrl;
  }
  const url = `${normalizeOllamaBaseURL(baseUrl)}/tags`;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) {
      return NextResponse.json(
        { error: `Ollama responded ${r.status}`, baseUrl },
        { status: 502 },
      );
    }
    const json = (await r.json()) as { models?: unknown };
    return NextResponse.json({ models: Array.isArray(json.models) ? json.models : [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown network error';
    return NextResponse.json({ error: message, baseUrl }, { status: 502 });
  }
}

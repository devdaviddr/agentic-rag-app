import { NextResponse } from 'next/server';
import { normalizeOllamaBaseURL } from '@app/rag';
import { getSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { ollamaBaseUrl } = await getSettings();
  const url = `${normalizeOllamaBaseURL(ollamaBaseUrl)}/tags`;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) {
      return NextResponse.json(
        { error: `Ollama responded ${r.status}`, baseUrl: ollamaBaseUrl },
        { status: 502 },
      );
    }
    const json = (await r.json()) as { models?: unknown };
    return NextResponse.json({ models: Array.isArray(json.models) ? json.models : [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown network error';
    return NextResponse.json({ error: message, baseUrl: ollamaBaseUrl }, { status: 502 });
  }
}

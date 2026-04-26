import { NextRequest, NextResponse } from 'next/server';
import { extractPdfText, ingestDocument } from '@app/rag';
import { getEnv } from '@/lib/env';
import { getEmbedder } from '@/lib/embedder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

type Kind = 'text' | 'pdf';

function detectKind(filename: string, mime: string): Kind | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  if (
    lower.endsWith('.txt') ||
    lower.endsWith('.md') ||
    lower.endsWith('.markdown') ||
    mime.startsWith('text/')
  ) {
    return 'text';
  }
  return null;
}

function resolveMime(kind: Kind, providedMime: string, filename: string): string {
  if (providedMime && providedMime !== 'application/octet-stream') return providedMime;
  if (kind === 'pdf') return 'application/pdf';
  if (filename.toLowerCase().endsWith('.md') || filename.toLowerCase().endsWith('.markdown')) {
    return 'text/markdown';
  }
  return 'text/plain';
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing `file` field' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${file.size} > ${MAX_BYTES} bytes)` },
      { status: 413 },
    );
  }

  const kind = detectKind(file.name, file.type);
  if (!kind) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.name} (${file.type || 'unknown'}). Allowed: .txt, .md, .pdf` },
      { status: 415 },
    );
  }

  // Read once: bytes get persisted as the original; text-extraction path
  // either decodes them (text) or hands them to unpdf (pdf).
  const rawBytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = resolveMime(kind, file.type, file.name);

  let content: string;
  const metadata: Record<string, unknown> = {
    filename: file.name,
    mimeType,
    bytes: file.size,
  };

  try {
    if (kind === 'pdf') {
      const { text, pageCount } = await extractPdfText(rawBytes);
      content = text;
      metadata.pageCount = pageCount;
    } else {
      content = new TextDecoder('utf-8', { fatal: false }).decode(rawBytes).trim();
      if (content.length === 0) {
        return NextResponse.json({ error: 'File contains no text' }, { status: 400 });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to extract text';
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const titleField = form.get('title');
  const title =
    typeof titleField === 'string' && titleField.trim().length > 0 ? titleField.trim() : file.name;

  const env = getEnv();
  const embedder = getEmbedder();
  const result = await ingestDocument(
    {
      source: file.name,
      title,
      content,
      metadata,
    },
    {
      chunkSize: env.RAG_CHUNK_SIZE,
      chunkOverlap: env.RAG_CHUNK_OVERLAP,
      embedder,
    },
    {
      originalBytes: rawBytes,
      mimeType,
      bytes: file.size,
    },
  );

  return NextResponse.json(
    { ...result, source: file.name, kind, bytes: file.size },
    { status: 201 },
  );
}

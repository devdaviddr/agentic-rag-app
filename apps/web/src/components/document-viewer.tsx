'use client';

import { useEffect, useState } from 'react';
import { DownloadIcon } from './icons';

interface ChunkRow {
  id: string;
  ordinal: number;
  content: string;
  tokens: number | null;
  embedding?: number[] | null;
}

type Tab = 'original' | 'chunks';

export function DocumentViewer({
  id,
  source,
  mimeType,
  hasOriginal,
}: {
  id: string;
  source: string;
  mimeType: string | null;
  hasOriginal: boolean;
}) {
  const [tab, setTab] = useState<Tab>(hasOriginal ? 'original' : 'chunks');
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1 border-b border-border-subtle">
        {hasOriginal && (
          <TabButton active={tab === 'original'} onClick={() => setTab('original')}>
            Original
          </TabButton>
        )}
        <TabButton active={tab === 'chunks'} onClick={() => setTab('chunks')}>
          Chunks &amp; embeddings
        </TabButton>
        {hasOriginal && (
          <a
            href={`/api/documents/${id}/original?download=1`}
            className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-secondary hover:bg-subtle hover:text-primary transition-colors"
          >
            <DownloadIcon size={13} />
            Download
          </a>
        )}
      </div>
      {tab === 'original' && hasOriginal && (
        <OriginalView id={id} source={source} mimeType={mimeType} />
      )}
      {tab === 'chunks' && <ChunksView id={id} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'relative h-10 px-4 text-sm font-medium transition-colors',
        active
          ? 'text-primary'
          : 'text-secondary hover:text-primary',
      ].join(' ')}
    >
      {children}
      {active && (
        <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
      )}
    </button>
  );
}

function OriginalView({
  id,
  source,
  mimeType,
}: {
  id: string;
  source: string;
  mimeType: string | null;
}) {
  const url = `/api/documents/${id}/original`;
  const isPdf = mimeType === 'application/pdf' || source.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    return (
      <iframe
        src={url}
        title={source}
        className="w-full h-[calc(100vh-260px)] min-h-[480px] rounded-xl border border-border-subtle bg-surface shadow-sm"
      />
    );
  }

  return <TextOriginalView url={url} />;
}

function TextOriginalView({ url }: { url: string }) {
  const [text, setText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => !cancelled && setText(t))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (error) return <p className="text-sm text-danger">Failed to load: {error}</p>;
  return (
    <pre className="m-0 max-h-[calc(100vh-260px)] overflow-auto rounded-xl border border-border-subtle bg-surface p-5 text-sm leading-relaxed text-primary whitespace-pre-wrap break-words shadow-sm">
      {text}
    </pre>
  );
}

function ChunksView({ id }: { id: string }) {
  const [chunks, setChunks] = useState<ChunkRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/documents/${id}/chunks?include=embedding`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { chunks: ChunkRow[] }) => !cancelled && setChunks(j.chunks))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <p className="text-sm text-danger">Failed to load chunks: {error}</p>;
  if (!chunks) return <p className="text-sm text-muted">Loading chunks…</p>;
  if (chunks.length === 0) return <p className="text-sm text-muted">No chunks for this document.</p>;

  return (
    <ol className="flex flex-col gap-3">
      {chunks.map((c) => (
        <li
          key={c.id}
          className="rounded-xl border border-border-subtle bg-surface p-5 flex flex-col gap-3 shadow-sm"
        >
          <header className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center h-5 px-2 rounded-full bg-accent-subtle text-accent font-medium">
              chunk #{c.ordinal}
            </span>
            <span className="text-muted">{c.content.length} chars</span>
            {c.tokens !== null && (
              <>
                <span className="text-border-default">·</span>
                <span className="text-muted">{c.tokens} tokens</span>
              </>
            )}
            <span className="text-border-default">·</span>
            <EmbeddingMeta vec={c.embedding ?? null} />
          </header>
          <pre className="m-0 text-sm leading-relaxed text-primary whitespace-pre-wrap break-words">
            {c.content}
          </pre>
          {c.embedding && c.embedding.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs font-medium text-accent hover:text-accent-hover transition-colors select-none">
                embedding (first 8 of {c.embedding.length})
              </summary>
              <code className="mt-2 block rounded-lg bg-subtle p-3 font-mono text-[11px] text-secondary overflow-x-auto">
                [{c.embedding.slice(0, 8).map((v) => v.toFixed(4)).join(', ')}, …]
              </code>
            </details>
          )}
        </li>
      ))}
    </ol>
  );
}

function EmbeddingMeta({ vec }: { vec: number[] | null }) {
  if (!vec || vec.length === 0) return <span className="text-danger">no embedding</span>;
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return (
    <span className="text-muted">
      dim {vec.length} · ‖v‖ {norm.toFixed(3)}
    </span>
  );
}

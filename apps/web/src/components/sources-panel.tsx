'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DocsIcon,
  FileIcon,
  PdfIcon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
} from './icons';

type IngestStatus =
  | 'queued'
  | 'rasterizing'
  | 'ocr'
  | 'embedding'
  | 'ready'
  | 'failed'
  | string;

interface DocumentRow {
  id: string;
  source: string;
  title: string | null;
  mimeType: string | null;
  bytes: number | null;
  hasOriginal: boolean;
  chunkCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  ingestStatus: IngestStatus;
  ingestError: string | null;
  pagesDone: number;
  pagesTotal: number | null;
  extractionMethod: string | null;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; message: string }
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string };

const TERMINAL: ReadonlySet<string> = new Set(['ready', 'failed']);

export function SourcesPanel({ onChange }: { onChange?: () => void }) {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteSource, setPasteSource] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetch('/api/sources', { cache: 'no-store' });
    if (!r.ok) {
      setStatus({ kind: 'error', message: `Sources fetch failed: ${r.status}` });
      return;
    }
    const json = (await r.json()) as { documents: DocumentRow[] };
    setDocs(json.documents);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Single shared poll loop. Walk all non-terminal docs every 2s; merge
  // status into row state. Stops when nothing pending.
  useEffect(() => {
    const pending = docs.filter((d) => !TERMINAL.has(d.ingestStatus));
    if (pending.length === 0) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const updates = await Promise.all(
        pending.map(async (d) => {
          try {
            const r = await fetch(`/api/documents/${d.id}/status`, { cache: 'no-store' });
            if (!r.ok) return null;
            const j = (await r.json()) as {
              status: IngestStatus;
              pagesDone: number;
              pagesTotal: number | null;
              error: string | null;
              extractionMethod: string | null;
            };
            return { id: d.id, ...j };
          } catch {
            return null;
          }
        }),
      );
      let anyTerminal = false;
      setDocs((prev) =>
        prev.map((row) => {
          const u = updates.find((x) => x && x.id === row.id);
          if (!u) return row;
          if (TERMINAL.has(u.status)) anyTerminal = true;
          return {
            ...row,
            ingestStatus: u.status,
            ingestError: u.error,
            pagesDone: u.pagesDone ?? row.pagesDone,
            pagesTotal: u.pagesTotal ?? row.pagesTotal,
            extractionMethod: u.extractionMethod ?? row.extractionMethod,
          };
        }),
      );
      if (anyTerminal) onChange?.();
    }, 2000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [docs, onChange]);

  const onUpload = useCallback(
    async (file: File) => {
      setStatus({ kind: 'busy', message: `Uploading ${file.name}…` });
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/ingest/upload', { method: 'POST', body: fd });
      if (!r.ok && r.status !== 202) {
        const err = await r.json().catch(() => ({ error: r.statusText }));
        setStatus({ kind: 'error', message: err.error ?? `Upload failed: ${r.status}` });
        return;
      }
      const json = (await r.json()) as Partial<{
        chunkCount: number;
        documentId: string;
        queued: boolean;
      }>;
      const msg =
        json.queued
          ? `Queued ${file.name} — vision OCR starting…`
          : `Ingested ${file.name} (${json.chunkCount ?? 0} chunks)`;
      setStatus({ kind: 'ok', message: msg });
      await refresh();
      onChange?.();
    },
    [refresh, onChange],
  );

  const onPaste = useCallback(async () => {
    const source = pasteSource.trim();
    const content = pasteText.trim();
    if (!source || !content) {
      setStatus({ kind: 'error', message: 'Source and content are required.' });
      return;
    }
    setStatus({ kind: 'busy', message: `Ingesting ${source}…` });
    const r = await fetch('/api/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source, title: source, content }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: r.statusText }));
      setStatus({ kind: 'error', message: err.error ?? `Ingest failed: ${r.status}` });
      return;
    }
    const json = (await r.json()) as { chunkCount: number };
    setStatus({ kind: 'ok', message: `Ingested ${source} (${json.chunkCount} chunks)` });
    setPasteText('');
    setPasteSource('');
    setPasteOpen(false);
    await refresh();
    onChange?.();
  }, [pasteSource, pasteText, refresh, onChange]);

  const onDelete = useCallback(
    async (doc: DocumentRow) => {
      if (!confirm(`Delete ${doc.source}?`)) return;
      setStatus({ kind: 'busy', message: `Deleting ${doc.source}…` });
      const r = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
      if (!r.ok && r.status !== 204) {
        setStatus({ kind: 'error', message: `Delete failed: ${r.status}` });
        return;
      }
      setStatus({ kind: 'ok', message: `Deleted ${doc.source}` });
      await refresh();
      onChange?.();
    },
    [refresh, onChange],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-primary tracking-[-0.01em]">Documents</h2>
          <p className="mt-1 text-sm text-secondary">
            Upload files or paste text to grow the knowledge base.
          </p>
        </div>
        <span className="hidden sm:inline-flex items-center h-6 px-2.5 rounded-full bg-subtle text-xs font-medium text-secondary">
          {docs.length} {docs.length === 1 ? 'doc' : 'docs'}
        </span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void onUpload(f);
        }}
        onClick={() => fileInput.current?.click()}
        className={[
          'group cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors',
          dragOver
            ? 'border-accent bg-accent-subtle'
            : 'border-border-default bg-subtle/50 hover:border-border-strong hover:bg-subtle',
        ].join(' ')}
      >
        <div
          className={[
            'mx-auto flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
            dragOver ? 'bg-accent text-accent-foreground' : 'bg-surface text-muted shadow-xs group-hover:text-accent',
          ].join(' ')}
        >
          <UploadIcon size={18} />
        </div>
        <p className="mt-3 text-sm font-medium text-primary">Drop files or click to browse</p>
        <p className="mt-1 text-xs text-muted">txt · md · pdf</p>
        <input
          ref={fileInput}
          type="file"
          accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onUpload(f);
            e.target.value = '';
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setPasteOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-secondary hover:bg-subtle hover:text-primary transition-colors"
        >
          <PlusIcon size={14} />
          {pasteOpen ? 'Cancel paste' : 'Paste text instead'}
        </button>
        {status.kind !== 'idle' && <StatusInline status={status} />}
      </div>

      {pasteOpen && (
        <div className="rounded-xl border border-border-subtle bg-surface p-4 flex flex-col gap-3 shadow-sm">
          <input
            placeholder="source (e.g. notes/meeting-2026-04-26)"
            value={pasteSource}
            onChange={(e) => setPasteSource(e.target.value)}
            className="h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm placeholder:text-muted shadow-xs focus:border-border-strong focus:outline-none focus:ring-[3px] focus:ring-[var(--ring)]"
          />
          <textarea
            placeholder="paste content here…"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm placeholder:text-muted shadow-xs resize-y focus:border-border-strong focus:outline-none focus:ring-[3px] focus:ring-[var(--ring)]"
          />
          <div className="flex justify-end">
            <button
              onClick={onPaste}
              className="h-9 px-3.5 rounded-lg bg-accent text-accent-foreground text-sm font-semibold shadow-xs hover:bg-accent-hover transition-colors"
            >
              Ingest
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border-subtle bg-surface shadow-sm overflow-hidden">
        {docs.length === 0 ? (
          <EmptyDocs />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {docs.map((d) => (
              <SourceRow key={d.id} doc={d} onDelete={() => void onDelete(d)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusInline({ status }: { status: Status }) {
  if (status.kind === 'idle') return null;
  const dot =
    status.kind === 'error' ? 'bg-danger' : status.kind === 'ok' ? 'bg-success' : 'bg-warning';
  const text =
    status.kind === 'error' ? 'text-danger' : status.kind === 'ok' ? 'text-success' : 'text-secondary';
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status.message}
    </span>
  );
}

function StatusPill({ doc }: { doc: DocumentRow }) {
  const s = doc.ingestStatus;
  if (s === 'ready') {
    return (
      <span className="shrink-0 inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium bg-success-subtle text-success">
        ready
      </span>
    );
  }
  if (s === 'failed') {
    return (
      <span
        className="shrink-0 inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium bg-danger-subtle text-danger"
        title={doc.ingestError ?? 'Ingest failed'}
      >
        failed
      </span>
    );
  }
  if (s === 'queued') {
    return (
      <span className="shrink-0 inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium bg-subtle text-secondary">
        queued
      </span>
    );
  }
  // mid-pipeline
  return (
    <span className="shrink-0 inline-flex items-center gap-1.5 h-5 px-2 rounded-full text-[11px] font-medium bg-warning-subtle text-warning">
      <Spinner />
      {s}
    </span>
  );
}

function Spinner() {
  return (
    <svg
      className="h-3 w-3 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
  return (
    <div className="absolute left-0 right-0 bottom-0 h-[3px] bg-subtle">
      <div
        className="h-full bg-accent transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function statusLabelFor(doc: DocumentRow): string | null {
  const s = doc.ingestStatus;
  if (s === 'ready' || s === 'failed' || s === 'queued') return null;
  if (doc.pagesTotal != null && doc.pagesTotal > 0) {
    const phase = s === 'ocr' ? 'OCR' : s === 'rasterizing' ? 'rasterize' : s === 'embedding' ? 'embed' : s;
    return `${phase} · page ${doc.pagesDone}/${doc.pagesTotal}`;
  }
  return s;
}

function SourceRow({ doc, onDelete }: { doc: DocumentRow; onDelete: () => void }) {
  const isPdf = doc.mimeType === 'application/pdf' || doc.source.toLowerCase().endsWith('.pdf');
  const midPipeline =
    doc.ingestStatus !== 'ready' &&
    doc.ingestStatus !== 'failed' &&
    doc.ingestStatus !== 'queued' &&
    (doc.pagesTotal ?? 0) > 0;
  return (
    <li className="group relative flex items-center gap-3 px-4 py-3 hover:bg-subtle transition-colors">
      <Link href={`/documents/${doc.id}`} className="flex flex-1 min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-muted group-hover:bg-surface group-hover:text-accent transition-colors">
          {isPdf ? <PdfIcon size={16} /> : <FileIcon size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-primary">{doc.title ?? doc.source}</p>
          <p className="truncate text-xs text-muted">
            {doc.chunkCount} chunk{doc.chunkCount === 1 ? '' : 's'}
            {doc.bytes !== null ? ` · ${formatBytes(doc.bytes)}` : ''}
            {midPipeline && doc.pagesTotal != null
              ? ` · ${doc.pagesDone}/${doc.pagesTotal} pages`
              : ''}
            {' · '}
            {new Date(doc.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {statusLabelFor(doc) && (
            <span className="text-[11px] text-muted">{statusLabelFor(doc)}</span>
          )}
          <StatusPill doc={doc} />
        </div>
      </Link>
      <button
        onClick={onDelete}
        title="Delete"
        className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg text-muted opacity-0 group-hover:opacity-100 hover:bg-danger-subtle hover:text-danger transition-all"
      >
        <TrashIcon size={14} />
      </button>
      {midPipeline && doc.pagesTotal != null && (
        <ProgressBar done={doc.pagesDone} total={doc.pagesTotal} />
      )}
    </li>
  );
}

function EmptyDocs() {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-subtle text-muted">
        <DocsIcon size={18} />
      </div>
      <p className="mt-4 text-sm font-medium text-primary">No documents yet</p>
      <p className="mt-1 text-xs text-secondary">Upload your first file to get started.</p>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

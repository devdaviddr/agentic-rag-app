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
}

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; message: string }
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string };

export function SourcesPanel({ onChange }: { onChange?: () => void }) {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteSource, setPasteSource] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

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

  const onUpload = useCallback(
    async (file: File) => {
      setStatus({ kind: 'busy', message: `Uploading ${file.name}…` });
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/ingest/upload', { method: 'POST', body: fd });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }));
        setStatus({ kind: 'error', message: err.error ?? `Upload failed: ${r.status}` });
        return;
      }
      const json = (await r.json()) as { chunkCount: number };
      setStatus({ kind: 'ok', message: `Ingested ${file.name} (${json.chunkCount} chunks)` });
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

function SourceRow({ doc, onDelete }: { doc: DocumentRow; onDelete: () => void }) {
  const isPdf = doc.mimeType === 'application/pdf' || doc.source.toLowerCase().endsWith('.pdf');
  return (
    <li className="group flex items-center gap-3 px-4 py-3 hover:bg-subtle transition-colors">
      <Link href={`/documents/${doc.id}`} className="flex flex-1 min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-muted group-hover:bg-surface group-hover:text-accent transition-colors">
          {isPdf ? <PdfIcon size={16} /> : <FileIcon size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-primary">{doc.title ?? doc.source}</p>
          <p className="truncate text-xs text-muted">
            {doc.chunkCount} chunk{doc.chunkCount === 1 ? '' : 's'}
            {doc.bytes !== null ? ` · ${formatBytes(doc.bytes)}` : ''}
            {' · '}
            {new Date(doc.createdAt).toLocaleDateString()}
          </p>
        </div>
        <span className="shrink-0 inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium bg-success-subtle text-success">
          indexed
        </span>
      </Link>
      <button
        onClick={onDelete}
        title="Delete"
        className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg text-muted opacity-0 group-hover:opacity-100 hover:bg-danger-subtle hover:text-danger transition-all"
      >
        <TrashIcon size={14} />
      </button>
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

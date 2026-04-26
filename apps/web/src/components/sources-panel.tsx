'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface DocumentRow {
  id: string;
  source: string;
  title: string | null;
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
    <aside style={panelStyle}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0, fontSize: 14, letterSpacing: 0.5, textTransform: 'uppercase', color: '#aaa' }}>
          Knowledge base
        </h2>
        <span style={{ color: '#666', fontSize: 12 }}>{docs.length} doc{docs.length === 1 ? '' : 's'}</span>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button style={primaryBtn} onClick={() => fileInput.current?.click()}>
          Upload .txt / .md / .pdf
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onUpload(f);
            e.target.value = '';
          }}
        />
        <button style={secondaryBtn} onClick={() => setPasteOpen((o) => !o)}>
          {pasteOpen ? 'Cancel paste' : 'Paste text'}
        </button>
        {pasteOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              placeholder="source (e.g. notes/meeting-2026-04-26)"
              value={pasteSource}
              onChange={(e) => setPasteSource(e.target.value)}
              style={inputStyle}
            />
            <textarea
              placeholder="paste content here…"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <button style={primaryBtn} onClick={onPaste}>
              Ingest
            </button>
          </div>
        )}
      </div>

      {status.kind !== 'idle' && (
        <div
          style={{
            fontSize: 12,
            padding: '8px 10px',
            borderRadius: 6,
            background:
              status.kind === 'error' ? '#3b1414' : status.kind === 'ok' ? '#0f2a1a' : '#1a2333',
            color:
              status.kind === 'error' ? '#fca5a5' : status.kind === 'ok' ? '#a7f3d0' : '#cbd5e1',
            border: '1px solid #2a2a2c',
          }}
        >
          {status.message}
        </div>
      )}

      <ul style={listStyle}>
        {docs.length === 0 && (
          <li style={{ color: '#666', fontSize: 13, padding: '12px 10px' }}>
            No documents yet. Upload one above.
          </li>
        )}
        {docs.map((d) => (
          <li key={d.id} style={rowStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 13, color: '#f5f5f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.title ?? d.source}
              </span>
              <span style={{ fontSize: 11, color: '#777' }}>
                {d.source} · {d.chunkCount} chunk{d.chunkCount === 1 ? '' : 's'}
              </span>
            </div>
            <button
              onClick={() => void onDelete(d)}
              title="Delete"
              style={deleteBtn}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
  background: '#0f0f10',
  border: '1px solid #2a2a2c',
  borderRadius: 8,
  width: 320,
  maxHeight: 'calc(100vh - 80px)',
};

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #2a2a2c',
  background: '#0b0b0c',
  color: '#f5f5f5',
  fontSize: 13,
  fontFamily: 'inherit',
};

const primaryBtn: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 6,
  border: 'none',
  background: '#22d3ee',
  color: '#0b0b0c',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  ...primaryBtn,
  background: '#1f2937',
  color: '#e5e7eb',
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  overflowY: 'auto',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 6,
  background: '#161618',
  border: '1px solid #2a2a2c',
};

const deleteBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#ef4444',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
  padding: '0 4px',
};

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ResolvedSettings } from '@app/shared';
import { AlertIcon, CheckIcon } from './icons';

type Overrides = Partial<{
  ollamaBaseUrl: string | null;
  chatModel: string | null;
  embedModel: string | null;
  visionModel: string | null;
  chatTemperature: number | null;
  ragTopK: number | null;
  ragChunkSize: number | null;
  ragChunkOverlap: number | null;
}>;

interface SettingsPayload {
  resolved: ResolvedSettings;
  overrides: Overrides;
  envDefaults: ResolvedSettings;
}

type Field = keyof ResolvedSettings;

type Draft = Partial<Record<Field, string | number | null>>;

interface OllamaModel {
  name: string;
  size?: number;
  digest?: string;
  modified_at?: string;
}

type TestState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ok'; models: OllamaModel[] }
  | { kind: 'error'; message: string };

export function SettingsForm() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });

  const refresh = useCallback(async () => {
    const r = await fetch('/api/settings', { cache: 'no-store' });
    if (!r.ok) {
      setSaveError(`Failed to load settings: ${r.status}`);
      return;
    }
    const json = (await r.json()) as SettingsPayload;
    setData(json);
    setDraft({});
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setField = useCallback((f: Field, v: string | number | null) => {
    setSaveOk(false);
    setDraft((d) => ({ ...d, [f]: v }));
  }, []);

  const dirty = useMemo(() => Object.keys(draft).length > 0, [draft]);

  const onSave = useCallback(async () => {
    if (!dirty) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }));
        setSaveError(err.error ?? `Save failed: ${r.status}`);
        return;
      }
      const json = (await r.json()) as SettingsPayload;
      setData(json);
      setDraft({});
      setSaveOk(true);
    } finally {
      setSaving(false);
    }
  }, [dirty, draft]);

  const onTest = useCallback(async () => {
    setTest({ kind: 'busy' });
    const r = await fetch('/api/ollama/tags', { cache: 'no-store' });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: r.statusText }));
      setTest({ kind: 'error', message: err.error ?? `HTTP ${r.status}` });
      return;
    }
    const json = (await r.json()) as { models: OllamaModel[] };
    setTest({ kind: 'ok', models: json.models ?? [] });
  }, []);

  if (!data) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  const effective = (f: Field): string | number => {
    if (f in draft) {
      const v = draft[f];
      return v === null ? data.envDefaults[f] : (v as string | number);
    }
    const o = data.overrides[f as keyof Overrides];
    if (o !== undefined && o !== null) return o as string | number;
    return data.envDefaults[f];
  };

  const hasOverride = (f: Field): boolean => {
    if (f in draft) return draft[f] !== null;
    const o = data.overrides[f as keyof Overrides];
    return o !== undefined && o !== null;
  };

  return (
    <div className="flex flex-col gap-6">
      <Card title="Ollama" subtitle="Local model server endpoint.">
        <FieldRow
          label="Base URL"
          help="e.g. http://localhost:11434"
          envHint={data.envDefaults.ollamaBaseUrl}
          override={hasOverride('ollamaBaseUrl')}
          onReset={() => setField('ollamaBaseUrl', null)}
        >
          <input
            value={String(effective('ollamaBaseUrl'))}
            onChange={(e) => setField('ollamaBaseUrl', e.target.value)}
            placeholder={data.envDefaults.ollamaBaseUrl}
            className={inputCls}
          />
        </FieldRow>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => void onTest()}
            disabled={test.kind === 'busy'}
            className="h-9 px-3.5 rounded-lg bg-surface text-primary border border-border-default text-sm font-semibold shadow-xs hover:bg-subtle transition-colors disabled:opacity-50"
          >
            {test.kind === 'busy' ? 'Testing…' : 'Test connection'}
          </button>
          {test.kind === 'error' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-danger">
              <AlertIcon size={14} /> {test.message}
            </span>
          )}
          {test.kind === 'ok' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-success">
              <CheckIcon size={14} /> {test.models.length} model{test.models.length === 1 ? '' : 's'} found
            </span>
          )}
        </div>

        {test.kind === 'ok' && (
          <ModelAvailability
            models={test.models}
            chatModel={String(effective('chatModel'))}
            embedModel={String(effective('embedModel'))}
            visionModel={String(effective('visionModel'))}
          />
        )}
      </Card>

      <Card title="Models" subtitle="Identifiers as Ollama tags (e.g. llama3.1:8b).">
        <FieldRow
          label="Chat model"
          envHint={data.envDefaults.chatModel}
          override={hasOverride('chatModel')}
          onReset={() => setField('chatModel', null)}
        >
          <input
            value={String(effective('chatModel'))}
            onChange={(e) => setField('chatModel', e.target.value)}
            placeholder={data.envDefaults.chatModel}
            className={inputCls}
          />
        </FieldRow>

        <FieldRow
          label="Embedding model"
          envHint={data.envDefaults.embedModel}
          override={hasOverride('embedModel')}
          onReset={() => setField('embedModel', null)}
        >
          <input
            value={String(effective('embedModel'))}
            onChange={(e) => setField('embedModel', e.target.value)}
            placeholder={data.envDefaults.embedModel}
            className={inputCls}
          />
          <p className="mt-2 inline-flex items-start gap-1.5 rounded-md bg-warning-subtle px-2.5 py-1.5 text-xs text-warning">
            <AlertIcon size={14} />
            Changing the embed model requires re-uploading affected documents (vector dimensions may differ).
          </p>
        </FieldRow>

        <FieldRow
          label="Vision model"
          help="Used for PDF page OCR + figure summarization."
          envHint={data.envDefaults.visionModel}
          override={hasOverride('visionModel')}
          onReset={() => setField('visionModel', null)}
        >
          <input
            value={String(effective('visionModel'))}
            onChange={(e) => setField('visionModel', e.target.value)}
            placeholder={data.envDefaults.visionModel}
            className={inputCls}
          />
        </FieldRow>
      </Card>

      <Card title="Chat" subtitle="Generation parameters.">
        <FieldRow
          label={`Temperature (${Number(effective('chatTemperature')).toFixed(2)})`}
          help="0 = deterministic, 1 = creative."
          envHint={String(data.envDefaults.chatTemperature)}
          override={hasOverride('chatTemperature')}
          onReset={() => setField('chatTemperature', null)}
        >
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={Number(effective('chatTemperature'))}
            onChange={(e) => setField('chatTemperature', Number(e.target.value))}
            className="w-full"
          />
        </FieldRow>
      </Card>

      <div className="rounded-xl border border-border-subtle bg-surface shadow-sm">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="w-full flex items-center justify-between px-5 py-4 text-left"
        >
          <div>
            <h3 className="text-lg font-semibold text-primary tracking-[-0.01em]">Advanced</h3>
            <p className="mt-1 text-xs text-secondary">Retrieval knobs — change with care.</p>
          </div>
          <span className="text-xs text-muted">{advancedOpen ? 'Hide' : 'Show'}</span>
        </button>
        {advancedOpen && (
          <div className="px-5 pb-5 flex flex-col gap-4 border-t border-border-subtle pt-4">
            <FieldRow
              label="Top-K"
              help="Chunks returned per retrieval call."
              envHint={String(data.envDefaults.ragTopK)}
              override={hasOverride('ragTopK')}
              onReset={() => setField('ragTopK', null)}
            >
              <input
                type="number"
                min={1}
                value={Number(effective('ragTopK'))}
                onChange={(e) => setField('ragTopK', Number(e.target.value))}
                className={inputCls}
              />
            </FieldRow>

            <FieldRow
              label="Chunk size"
              help="Target characters per chunk."
              envHint={String(data.envDefaults.ragChunkSize)}
              override={hasOverride('ragChunkSize')}
              onReset={() => setField('ragChunkSize', null)}
            >
              <input
                type="number"
                min={1}
                value={Number(effective('ragChunkSize'))}
                onChange={(e) => setField('ragChunkSize', Number(e.target.value))}
                className={inputCls}
              />
            </FieldRow>

            <FieldRow
              label="Chunk overlap"
              help="Characters of overlap between adjacent chunks."
              envHint={String(data.envDefaults.ragChunkOverlap)}
              override={hasOverride('ragChunkOverlap')}
              onReset={() => setField('ragChunkOverlap', null)}
            >
              <input
                type="number"
                min={0}
                value={Number(effective('ragChunkOverlap'))}
                onChange={(e) => setField('ragChunkOverlap', Number(e.target.value))}
                className={inputCls}
              />
            </FieldRow>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 py-3 bg-bg-app/90 backdrop-blur border-t border-border-subtle flex items-center justify-end gap-3">
        {saveError && (
          <span className="inline-flex items-center gap-1.5 text-xs text-danger">
            <AlertIcon size={14} /> {saveError}
          </span>
        )}
        {saveOk && !dirty && (
          <span className="inline-flex items-center gap-1.5 text-xs text-success">
            <CheckIcon size={14} /> Saved
          </span>
        )}
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={!dirty || saving}
          className="h-9 px-3.5 rounded-lg bg-accent text-accent-foreground text-sm font-semibold shadow-xs hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

const inputCls =
  'h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm placeholder:text-muted shadow-xs focus:border-border-strong focus:outline-none focus:ring-[3px] focus:ring-[var(--ring)]';

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border-subtle bg-surface shadow-sm p-5 md:p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-primary tracking-[-0.01em]">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-secondary">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function FieldRow({
  label,
  help,
  envHint,
  override,
  onReset,
  children,
}: {
  label: string;
  help?: string;
  envHint: string;
  override: boolean;
  onReset: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-2 md:gap-6">
      <div className="pt-1">
        <p className="text-sm font-medium text-primary">{label}</p>
        {help && <p className="mt-0.5 text-xs text-muted">{help}</p>}
      </div>
      <div>
        {children}
        <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
          <span className="text-muted">
            env default: <span className="font-mono text-secondary">{envHint}</span>
          </span>
          {override && (
            <button
              type="button"
              onClick={onReset}
              className="text-accent hover:underline"
            >
              Reset to env default
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ModelAvailability({
  models,
  chatModel,
  embedModel,
  visionModel,
}: {
  models: OllamaModel[];
  chatModel: string;
  embedModel: string;
  visionModel: string;
}) {
  const names = new Set(models.map((m) => m.name));
  const rows: Array<{ label: string; name: string }> = [
    { label: 'Chat', name: chatModel },
    { label: 'Embed', name: embedModel },
    { label: 'Vision', name: visionModel },
  ];
  return (
    <div className="rounded-md border border-border-subtle bg-subtle/40 p-3 flex flex-col gap-1.5">
      {rows.map((r) => {
        const ok = names.has(r.name);
        return (
          <div key={r.label} className="flex items-center gap-2 text-xs">
            {ok ? (
              <span className="text-success">
                <CheckIcon size={14} />
              </span>
            ) : (
              <span className="text-danger">
                <AlertIcon size={14} />
              </span>
            )}
            <span className="text-secondary w-14">{r.label}</span>
            <span className="font-mono text-primary">{r.name}</span>
            {!ok && (
              <code className="ml-auto rounded bg-surface px-1.5 py-0.5 text-[11px] text-muted border border-border-subtle">
                ollama pull {r.name}
              </code>
            )}
          </div>
        );
      })}
    </div>
  );
}

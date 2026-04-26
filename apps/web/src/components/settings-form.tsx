'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type TagState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ok'; models: OllamaModel[] }
  | { kind: 'error'; message: string };

// Ollama returns "nomic-embed-text:latest"; users often store
// "nomic-embed-text" (no tag). Normalize so a tagless name matches
// the same name with `:latest` appended.
function normalizeTag(name: string): string {
  return name.includes(':') ? name : `${name}:latest`;
}

function modelMatches(stored: string, available: ReadonlySet<string>): boolean {
  if (!stored) return false;
  if (available.has(stored)) return true;
  return available.has(normalizeTag(stored));
}

export function SettingsForm() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [tags, setTags] = useState<TagState>({ kind: 'idle' });
  const fetchSeq = useRef(0);

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

  // Auto-fetch tags whenever the effective Base URL changes (initial load
  // and live edits), debounced so we don't hammer the server.
  const baseUrlForFetch = useMemo(() => {
    if (!data) return null;
    if ('ollamaBaseUrl' in draft) {
      const v = draft.ollamaBaseUrl;
      if (v === null) return data.envDefaults.ollamaBaseUrl;
      if (typeof v === 'string') return v;
    }
    return data.resolved.ollamaBaseUrl;
  }, [data, draft]);

  useEffect(() => {
    if (!baseUrlForFetch) return;
    try {
      new URL(baseUrlForFetch);
    } catch {
      return;
    }
    const t = setTimeout(() => {
      void fetchTags(baseUrlForFetch);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrlForFetch]);

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

  const fetchTags = useCallback(async (baseUrl: string) => {
    const seq = ++fetchSeq.current;
    setTags({ kind: 'busy' });
    try {
      const url = `/api/ollama/tags?baseUrl=${encodeURIComponent(baseUrl)}`;
      const r = await fetch(url, { cache: 'no-store' });
      if (seq !== fetchSeq.current) return;
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }));
        setTags({ kind: 'error', message: err.error ?? `HTTP ${r.status}` });
        return;
      }
      const json = (await r.json()) as { models: OllamaModel[] };
      setTags({ kind: 'ok', models: json.models ?? [] });
    } catch (err) {
      if (seq !== fetchSeq.current) return;
      const message = err instanceof Error ? err.message : 'unknown error';
      setTags({ kind: 'error', message });
    }
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

  const currentBaseUrl = String(effective('ollamaBaseUrl'));

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
            value={currentBaseUrl}
            onChange={(e) => setField('ollamaBaseUrl', e.target.value)}
            placeholder={data.envDefaults.ollamaBaseUrl}
            className={inputCls}
          />
        </FieldRow>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => void fetchTags(currentBaseUrl)}
            disabled={tags.kind === 'busy'}
            className="h-9 px-3.5 rounded-lg bg-surface text-primary border border-border-default text-sm font-semibold shadow-xs hover:bg-subtle transition-colors disabled:opacity-50"
          >
            {tags.kind === 'busy' ? 'Testing…' : 'Test connection'}
          </button>
          {tags.kind === 'error' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-danger">
              <AlertIcon size={14} /> {tags.message}
            </span>
          )}
          {tags.kind === 'ok' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-success">
              <CheckIcon size={14} /> {tags.models.length} model{tags.models.length === 1 ? '' : 's'} found
            </span>
          )}
        </div>

        {tags.kind === 'ok' && (
          <ModelAvailability
            models={tags.models}
            chatModel={String(effective('chatModel'))}
            embedModel={String(effective('embedModel'))}
            visionModel={String(effective('visionModel'))}
          />
        )}
      </Card>

      <Card
        title="Models"
        subtitle="Pick from the models pulled on the Ollama host above."
      >
        <ModelField
          label="Chat model"
          field="chatModel"
          tags={tags}
          envDefault={data.envDefaults.chatModel}
          value={String(effective('chatModel'))}
          override={hasOverride('chatModel')}
          onChange={(v) => setField('chatModel', v)}
          onReset={() => setField('chatModel', null)}
          onRefresh={() => void fetchTags(currentBaseUrl)}
        />

        <ModelField
          label="Embedding model"
          field="embedModel"
          tags={tags}
          envDefault={data.envDefaults.embedModel}
          value={String(effective('embedModel'))}
          override={hasOverride('embedModel')}
          onChange={(v) => setField('embedModel', v)}
          onReset={() => setField('embedModel', null)}
          onRefresh={() => void fetchTags(currentBaseUrl)}
          warningSlot={
            <p className="mt-2 inline-flex items-start gap-1.5 rounded-md bg-warning-subtle px-2.5 py-1.5 text-xs text-warning">
              <AlertIcon size={14} />
              Changing the embed model requires re-uploading affected documents (vector dimensions may differ).
            </p>
          }
        />

        <ModelField
          label="Vision model"
          field="visionModel"
          help="Used for PDF page OCR + figure summarization."
          tags={tags}
          envDefault={data.envDefaults.visionModel}
          value={String(effective('visionModel'))}
          override={hasOverride('visionModel')}
          onChange={(v) => setField('visionModel', v)}
          onReset={() => setField('visionModel', null)}
          onRefresh={() => void fetchTags(currentBaseUrl)}
        />
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

const selectCls =
  'h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-primary shadow-xs focus:border-border-strong focus:outline-none focus:ring-[3px] focus:ring-[var(--ring)]';

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

function ModelField({
  label,
  help,
  field,
  tags,
  envDefault,
  value,
  override,
  onChange,
  onReset,
  onRefresh,
  warningSlot,
}: {
  label: string;
  help?: string;
  field: 'chatModel' | 'embedModel' | 'visionModel';
  tags: TagState;
  envDefault: string;
  value: string;
  override: boolean;
  onChange: (v: string) => void;
  onReset: () => void;
  onRefresh: () => void;
  warningSlot?: React.ReactNode;
}) {
  const models = tags.kind === 'ok' ? tags.models : [];
  const names = useMemo(() => models.map((m) => m.name).sort((a, b) => a.localeCompare(b)), [models]);
  const valueSet = useMemo(() => new Set(names), [names]);
  const present = modelMatches(value, valueSet);
  // If the stored value is tagless and only `:latest` is in the list,
  // surface the canonical tagged form in the dropdown so it's selected.
  const selectValue = valueSet.has(value)
    ? value
    : valueSet.has(normalizeTag(value))
      ? normalizeTag(value)
      : value;

  return (
    <FieldRow
      label={label}
      help={help}
      envHint={envDefault}
      override={override}
      onReset={onReset}
    >
      {tags.kind === 'ok' && names.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <select
              value={selectValue}
              onChange={(e) => onChange(e.target.value)}
              className={selectCls}
              data-field={field}
            >
              {!names.includes(selectValue) && (
                <option value={selectValue}>{value} · not pulled</option>
              )}
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onRefresh}
              title="Refresh model list"
              className="shrink-0 h-9 px-2.5 rounded-md border border-border-default bg-surface text-xs text-secondary hover:bg-subtle"
            >
              Refresh
            </button>
          </div>
          {!present && (
            <span className="inline-flex items-center gap-1.5 text-xs text-warning">
              <AlertIcon size={13} />
              Selected model not found on the host. Run:
              <code className="rounded bg-subtle px-1.5 py-0.5 text-[11px] font-mono">
                ollama pull {value}
              </code>
            </span>
          )}
          {warningSlot}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={envDefault}
            className={inputCls}
          />
          <span className="text-xs text-muted">
            {tags.kind === 'busy'
              ? 'Loading models…'
              : tags.kind === 'error'
                ? `Could not list models (${tags.message}). Type the tag manually or click Test connection.`
                : 'Click Test connection to populate model dropdown.'}
          </span>
          {warningSlot}
        </div>
      )}
    </FieldRow>
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
        const ok = modelMatches(r.name, names);
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

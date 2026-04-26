/**
 * Phase C §10.6 + §10.6.1 image-guarantee post-processor.
 *
 * Belt-and-suspenders + hard floor for "user asked to see something, model
 * forgot to render it." Pure function — no streaming, no I/O. The chat
 * route calls this once with the assistant's final text and the union of
 * tool calls that fired during the run.
 */

export interface ToolCallRecord {
  toolName: string;
  args: unknown;
  result: unknown;
}

export interface ImageGuaranteeContext {
  userMessage: string;
  toolCalls: ToolCallRecord[];
}

export type InjectionReason = 'related_block' | 'hard_fallback' | 'none';

export interface ImageGuaranteeResult {
  patched: string;
  injected: { reason: InjectionReason; count: number };
}

interface FigureCandidate {
  id: string; // lowercase uuid
  page: number | null;
  title: string | null;
  source: string | null;
}

const VISUAL_INTENT_RE =
  /\b(show|view|see|look at|display|render|figure|chart|diagram|screenshot|image|photo|picture)\b/i;

const ASSET_TOKEN_RE = /asset:([0-9a-f-]{36})/gi;
const ASSET_IN_MD_RE = /asset:([0-9a-f-]{36})/i;

function pushUnique(map: Map<string, FigureCandidate>, c: FigureCandidate) {
  const key = c.id.toLowerCase();
  if (!map.has(key)) map.set(key, { ...c, id: key });
}

function extractCandidates(toolCalls: ToolCallRecord[]): FigureCandidate[] {
  const out = new Map<string, FigureCandidate>();

  for (const call of toolCalls) {
    const name = call.toolName;
    const result = call.result as Record<string, unknown> | undefined;
    if (!result) continue;

    if (name === 'findFigure' || name === 'find_figure') {
      const figures = (result.figures ?? []) as Array<{
        assetMarkdown?: string;
        page?: number;
        title?: string | null;
        source?: string | null;
      }>;
      for (const f of figures) {
        const md = f.assetMarkdown ?? '';
        const m = md.match(ASSET_IN_MD_RE);
        const id = m?.[1];
        if (!id) continue;
        pushUnique(out, {
          id,
          page: typeof f.page === 'number' ? f.page : null,
          title: f.title ?? null,
          source: f.source ?? null,
        });
      }
    }

    if (name === 'search_kb' || name === 'searchKb') {
      const results = (result.results ?? []) as Array<{
        imageRefs?: Array<{ id?: string; page?: number; summary?: string | null }>;
        source?: string | null;
        title?: string | null;
      }>;
      for (const r of results) {
        const refs = r.imageRefs ?? [];
        for (const ref of refs) {
          if (!ref.id) continue;
          pushUnique(out, {
            id: ref.id,
            page: typeof ref.page === 'number' ? ref.page : null,
            title: r.title ?? null,
            source: r.source ?? null,
          });
        }
      }
    }
  }

  return [...out.values()];
}

function assetMarkdownFor(c: FigureCandidate): string {
  const label = c.title ?? c.source ?? 'figure';
  const pageSuffix = c.page != null ? ` (p.${c.page})` : '';
  return `![${label}${pageSuffix}](asset:${c.id})`;
}

function alreadyRendered(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(ASSET_TOKEN_RE)) {
    const id = m[1];
    if (id) out.add(id.toLowerCase());
  }
  return out;
}

export function applyImageGuarantee(
  text: string,
  ctx: ImageGuaranteeContext,
): ImageGuaranteeResult {
  const visualIntent = VISUAL_INTENT_RE.test(ctx.userMessage ?? '');
  const candidates = extractCandidates(ctx.toolCalls);

  if (candidates.length === 0) {
    return { patched: text, injected: { reason: 'none', count: 0 } };
  }

  const rendered = alreadyRendered(text);
  const missing = candidates.filter((c) => !rendered.has(c.id));

  let patched = text;
  let reason: InjectionReason = 'none';
  let count = 0;

  // §10.6 related-block path
  if (visualIntent && missing.length > 0) {
    const take = missing.slice(0, 3);
    const lines = take.map((c) => assetMarkdownFor(c)).join('\n\n');
    patched = `${patched}\n\n---\n**Related figure(s)**\n\n${lines}`;
    reason = 'related_block';
    count = take.length;
  }

  // §10.6.1 hard-fallback (recompute presence after step 5)
  const stillRendered = alreadyRendered(patched);
  const top = candidates[0];
  if (visualIntent && stillRendered.size === 0 && top) {
    patched = `${assetMarkdownFor(top)}\n${patched}`;
    reason = 'hard_fallback';
    count = 1;
  }

  return { patched, injected: { reason, count } };
}

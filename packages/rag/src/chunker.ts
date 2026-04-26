export interface ChunkOptions {
  chunkSize: number;
  chunkOverlap: number;
}

/**
 * Recursive character splitter. Walks separators from coarse (paragraph) to
 * fine (word) and falls back to hard slicing only when a single span is bigger
 * than chunkSize. Overlap is applied between adjacent emitted chunks.
 *
 * Includes a defensive post-pass (`mergeAssetTokens`) that re-stitches any
 * adjacent pair where the boundary fell mid-`![alt](asset:UUID)` token.
 * Per spec §10/D2 — chunker is char-based and even with `\n\n` flanks, a
 * pathological input can split inside the asset URI; the chat-side image
 * guarantee depends on those tokens being intact.
 */
export function chunkText(input: string, opts: ChunkOptions): string[] {
  const { chunkSize, chunkOverlap } = opts;
  if (chunkOverlap >= chunkSize) {
    throw new Error('chunkOverlap must be smaller than chunkSize');
  }
  const separators = ['\n\n', '\n', '. ', ' ', ''];
  const pieces = splitRecursive(input.trim(), separators, chunkSize);
  const merged = mergeWithOverlap(pieces, chunkSize, chunkOverlap);
  return mergeAssetTokens(merged);
}

/**
 * Open `![alt](asset:` with no closing `)` yet. Matches spec D2 — a head that
 * has the markdown-image opener and the `asset:` URI prefix but the chunk
 * boundary fell before the `)`. Allows 0..36 hex/hyphen chars (UUIDs are 36
 * chars including dashes) so a full-UUID-but-no-paren split is also caught.
 */
const PARTIAL_HEAD_RE = /!\[[^\]]*\]\(asset:[0-9a-f-]{0,36}$/i;
/** Tail half: starts with hex/hyphen UUID continuation followed by `)`. */
const PARTIAL_TAIL_RE = /^\s*[0-9a-f-]*\)/i;

/**
 * D2 post-pass: walk adjacent chunk pairs and merge any pair where chunk N
 * ends with a partial asset-token head (regex `PARTIAL_HEAD_RE`) OR chunk N+1
 * starts with the tail half (regex `PARTIAL_TAIL_RE`). Repeats until a fixed
 * point. Iteration cap = 1.5 * original length to bound pathological cases.
 */
export function mergeAssetTokens(chunks: string[]): string[] {
  if (chunks.length < 2) return chunks.slice();
  const cap = Math.ceil(chunks.length * 1.5);
  let work = chunks.slice();
  for (let pass = 0; pass < cap; pass++) {
    let merged = false;
    const out: string[] = [];
    for (let i = 0; i < work.length; i++) {
      const cur = work[i]!;
      const nxt = work[i + 1];
      if (
        nxt !== undefined &&
        (PARTIAL_HEAD_RE.test(cur) || PARTIAL_TAIL_RE.test(nxt))
      ) {
        out.push(cur + nxt);
        i++; // consume next
        merged = true;
      } else {
        out.push(cur);
      }
    }
    work = out;
    if (!merged) break;
  }
  return work;
}

function splitRecursive(text: string, seps: string[], maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const [sep, ...rest] = seps;
  if (sep === undefined) return [text];
  if (sep === '') {
    const out: string[] = [];
    for (let i = 0; i < text.length; i += maxLen) out.push(text.slice(i, i + maxLen));
    return out;
  }
  const parts = text.split(sep);
  const out: string[] = [];
  for (const part of parts) {
    if (part.length === 0) continue;
    if (part.length <= maxLen) {
      out.push(part);
    } else {
      out.push(...splitRecursive(part, rest, maxLen));
    }
  }
  return out;
}

function mergeWithOverlap(parts: string[], maxLen: number, overlap: number): string[] {
  const chunks: string[] = [];
  let buf = '';
  for (const part of parts) {
    if (buf.length === 0) {
      buf = part;
      continue;
    }
    if (buf.length + 1 + part.length <= maxLen) {
      buf = `${buf} ${part}`;
    } else {
      chunks.push(buf);
      const tail = buf.slice(Math.max(0, buf.length - overlap));
      buf = tail.length > 0 ? `${tail} ${part}` : part;
    }
  }
  if (buf.length > 0) chunks.push(buf);
  return chunks;
}

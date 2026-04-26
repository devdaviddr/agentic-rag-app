export interface ChunkOptions {
  chunkSize: number;
  chunkOverlap: number;
}

/**
 * Recursive character splitter. Walks separators from coarse (paragraph) to
 * fine (word) and falls back to hard slicing only when a single span is bigger
 * than chunkSize. Overlap is applied between adjacent emitted chunks.
 */
export function chunkText(input: string, opts: ChunkOptions): string[] {
  const { chunkSize, chunkOverlap } = opts;
  if (chunkOverlap >= chunkSize) {
    throw new Error('chunkOverlap must be smaller than chunkSize');
  }
  const separators = ['\n\n', '\n', '. ', ' ', ''];
  const pieces = splitRecursive(input.trim(), separators, chunkSize);
  return mergeWithOverlap(pieces, chunkSize, chunkOverlap);
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

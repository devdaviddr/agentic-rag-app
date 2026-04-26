import { describe, it, expect } from 'vitest';
import { chunkText, mergeAssetTokens } from '../chunker.js';

const UUID_A = '7f2c1e1a-aaaa-bbbb-cccc-1234567890ab';
const UUID_B = '00000000-0000-0000-0000-000000000001';

describe('mergeAssetTokens — D2 post-pass', () => {
  it('a) intact asset markdown survives chunking unchanged', () => {
    const md = `intro paragraph.\n\n![chart](asset:${UUID_A})\n\noutro paragraph.`;
    const chunks = chunkText(md, { chunkSize: 4096, chunkOverlap: 64 });
    // The intact token must appear verbatim in exactly one chunk.
    const matches = chunks.filter((c) => c.includes(`asset:${UUID_A}`));
    expect(matches.length).toBe(1);
    expect(matches[0]).toContain(`![chart](asset:${UUID_A})`);
  });

  it('b) split at "(asset:" — head + tail get merged', () => {
    const head = `body body body ![chart](asset:${UUID_A.slice(0, 8)}`;
    const tail = `${UUID_A.slice(8)}) trailing text`;
    const out = mergeAssetTokens([head, tail]);
    expect(out.length).toBe(1);
    expect(out[0]).toContain(`asset:${UUID_A}`);
    expect(out[0]).toContain(`![chart](asset:${UUID_A})`);
  });

  it('c) split at the closing ")" — tail starts with ")" → merge', () => {
    const head = `text text ![alt](asset:${UUID_A}`;
    const tail = `) more text after`;
    const out = mergeAssetTokens([head, tail]);
    expect(out.length).toBe(1);
    expect(out[0]).toContain(`![alt](asset:${UUID_A})`);
  });

  it('d) two consecutive figures both survive', () => {
    const md = [
      'opening text.',
      `![a](asset:${UUID_A})`,
      'middle paragraph.',
      `![b](asset:${UUID_B})`,
      'closing.',
    ].join('\n\n');
    const chunks = chunkText(md, { chunkSize: 4096, chunkOverlap: 64 });
    const all = chunks.join('\n\n');
    expect(all).toContain(`![a](asset:${UUID_A})`);
    expect(all).toContain(`![b](asset:${UUID_B})`);
  });

  it('idempotent: running mergeAssetTokens on already-clean chunks is a no-op', () => {
    const ok = ['hello world', `done ![x](asset:${UUID_A}) ok`, 'tail'];
    expect(mergeAssetTokens(ok)).toEqual(ok);
  });

  it('forces a chunk-boundary inside an asset token and recovers it', () => {
    // chunkSize chosen so the intact token straddles the split.
    const filler = 'lorem ipsum dolor sit amet '.repeat(10);
    const md = `${filler}\n\n![chart](asset:${UUID_A})\n\n${filler}`;
    // chunkSize ≈ middle of token.
    const tokenIdx = md.indexOf('asset:');
    const chunkSize = tokenIdx + 10;
    const chunks = chunkText(md, { chunkSize, chunkOverlap: 0 });
    const matches = chunks.filter((c) => c.includes(`asset:${UUID_A}`));
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0]).toContain(`![chart](asset:${UUID_A})`);
  });
});

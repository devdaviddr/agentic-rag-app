import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMarkdown } from '@/components/markdown';

const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAUAAeImBZsAAAAASUVORK5CYII=',
  'base64',
);

const realFetch = globalThis.fetch;

beforeAll(() => {
  // Intercept asset URLs and reply with a 1x1 PNG.
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
    if (url.includes('/api/assets/')) {
      return new Response(ONE_BY_ONE_PNG, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe('ChatMarkdown', () => {
  it('rewrites asset:UUID into /api/assets/UUID and renders an <img>', () => {
    const md = '![chart](asset:00000000-0000-4000-8000-000000000001)';
    render(<ChatMarkdown>{md}</ChatMarkdown>);
    const img = screen.getByRole('img', { name: 'chart' }) as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src.endsWith('/api/assets/00000000-0000-4000-8000-000000000001')).toBe(
      true,
    );
  });

  it('drops javascript: URLs via react-markdown default safelist', () => {
    const md = '[bad](javascript:alert(1))';
    const { container } = render(<ChatMarkdown>{md}</ChatMarkdown>);
    const anchors = container.querySelectorAll('a');
    for (const a of Array.from(anchors)) {
      expect(a.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
    }
  });

  it('drops asset URIs whose UUID does not match the strict regex', () => {
    const md = '![bad](asset:not-a-uuid)';
    const { container } = render(<ChatMarkdown>{md}</ChatMarkdown>);
    const imgs = container.querySelectorAll('img');
    for (const img of Array.from(imgs)) {
      // Strict-UUID rejection causes urlTransform to return '' which makes
      // react-markdown skip the image entirely. If any img made it through,
      // it must NOT carry the bad URI.
      expect(img.getAttribute('src') ?? '').not.toContain('not-a-uuid');
    }
  });
});

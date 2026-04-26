'use client';

import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ComponentPropsWithoutRef } from 'react';

const ASSET_PREFIX = 'asset:';
const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Custom URL transform: rewrite `asset:UUID` → `/api/assets/UUID`.
 * Strict UUID regex — invalid uuids are dropped to '' so react-markdown
 * skips the node. All other URIs are delegated to react-markdown's
 * defaultUrlTransform (drops javascript:, data: text/html, etc.).
 */
function urlTransform(uri: string): string {
  if (uri.startsWith(ASSET_PREFIX)) {
    const id = uri.slice(ASSET_PREFIX.length);
    if (!UUID_RE.test(id)) return '';
    return `/api/assets/${id}`;
  }
  return defaultUrlTransform(uri);
}

type ImgProps = ComponentPropsWithoutRef<'img'>;
type AnchorProps = ComponentPropsWithoutRef<'a'>;
type CodeProps = ComponentPropsWithoutRef<'code'> & { inline?: boolean };
type PreProps = ComponentPropsWithoutRef<'pre'>;
type TableProps = ComponentPropsWithoutRef<'table'>;

export function ChatMarkdown({ children }: { children: string }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={urlTransform}
        components={{
          img: ({ src, alt }: ImgProps) => {
            const safeSrc = typeof src === 'string' && src.length > 0 ? src : null;
            if (!safeSrc) return null;
            return (
              <a
                href={safeSrc}
                target="_blank"
                rel="noreferrer"
                className="my-3 block max-w-full"
              >
                <img
                  src={safeSrc}
                  alt={alt ?? ''}
                  loading="lazy"
                  decoding="async"
                  className="rounded-xl border border-border-subtle bg-surface shadow-sm max-h-[480px] max-w-full object-contain"
                  onError={(e) => {
                    const img = e.currentTarget;
                    const span = document.createElement('span');
                    span.className =
                      'inline-flex items-center gap-1.5 text-xs text-danger';
                    span.textContent = `Failed to load image (${alt ?? 'asset'})`;
                    img.replaceWith(span);
                  }}
                />
              </a>
            );
          },
          a: ({ href, children, ...rest }: AnchorProps) => (
            <a
              {...rest}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {children}
            </a>
          ),
          code: ({ inline, className, children, ...rest }: CodeProps) => {
            if (inline) {
              return (
                <code
                  {...rest}
                  className={`bg-subtle rounded px-1 ${className ?? ''}`}
                >
                  {children}
                </code>
              );
            }
            return (
              <code {...rest} className={className}>
                {children}
              </code>
            );
          },
          pre: ({ children, ...rest }: PreProps) => (
            <pre
              {...rest}
              className="bg-subtle rounded-lg p-3 text-xs overflow-x-auto"
            >
              {children}
            </pre>
          ),
          table: ({ children, ...rest }: TableProps) => (
            <div className="overflow-x-auto">
              <table
                {...rest}
                className="border border-border-subtle text-sm"
              >
                {children}
              </table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

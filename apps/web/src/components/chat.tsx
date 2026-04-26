'use client';

import { useChat } from 'ai/react';
import { useEffect, useRef } from 'react';
import { SendIcon, SparklesIcon } from './icons';

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: '/api/chat',
  });

  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const empty = messages.length === 0;

  return (
    <section className="flex flex-1 min-h-0 flex-col">
      <div ref={scrollerRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-chat px-4 md:px-6 py-8">
          {empty ? (
            <EmptyState />
          ) : (
            <ol className="flex flex-col gap-6">
              {messages.map((m) => (
                <li key={m.id}>
                  {m.role === 'user' ? (
                    <UserBubble content={m.content} />
                  ) : (
                    <AssistantMessage content={m.content} streaming={isLoading} />
                  )}
                </li>
              ))}
              {error && (
                <li>
                  <div className="rounded-xl border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger">
                    {error.message}
                  </div>
                </li>
              )}
            </ol>
          )}
        </div>
      </div>

      <div className="border-t border-border-subtle bg-bg-app/60 backdrop-blur">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-chat px-4 md:px-6 py-4 flex items-end gap-2"
        >
          <div className="relative flex-1">
            <input
              value={input}
              onChange={handleInputChange}
              placeholder="Ask something about your knowledge base…"
              className="w-full h-11 rounded-xl border border-border-default bg-surface pl-4 pr-12 text-sm text-primary placeholder:text-muted shadow-xs transition-colors focus:border-border-strong focus:outline-none focus:ring-[3px] focus:ring-[var(--ring)]"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="h-11 px-4 rounded-xl bg-accent text-accent-foreground text-sm font-semibold shadow-xs inline-flex items-center gap-2 transition-colors duration-150 hover:bg-accent-hover disabled:opacity-50 disabled:pointer-events-none"
          >
            <SendIcon size={15} />
            <span className="hidden sm:inline">{isLoading ? 'Sending…' : 'Send'}</span>
          </button>
        </form>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center text-center pt-16 pb-12">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-subtle text-accent shadow-xs">
        <SparklesIcon size={22} />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-primary tracking-[-0.01em]">
        Ask your knowledge base
      </h2>
      <p className="mt-2 max-w-sm text-sm text-secondary">
        The agent searches your indexed documents via tool calls and cites what it finds.
      </p>
    </div>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-accent-subtle px-4 py-2.5 text-base text-primary whitespace-pre-wrap break-words">
        {content}
      </div>
    </div>
  );
}

function AssistantMessage({ content, streaming }: { content: string; streaming: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent">
        <SparklesIcon size={14} />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-xs font-medium text-muted mb-1">Assistant</p>
        <div className="text-base text-primary leading-7 whitespace-pre-wrap break-words">
          {content}
          {streaming && !content && <span className="inline-block animate-pulse text-accent">▍</span>}
        </div>
      </div>
    </div>
  );
}

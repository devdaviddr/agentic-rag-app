'use client';

import { Chat } from '@/components/chat';
import { SourcesPanel } from '@/components/sources-panel';

export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: 1280,
        margin: '0 auto',
        padding: '24px 16px',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <header>
        <h1 style={{ margin: 0, fontSize: 22 }}>Agentic RAG</h1>
        <p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>
          Local-first knowledge base · Ollama + pgvector + Vercel AI SDK
        </p>
      </header>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '320px 1fr',
          gap: 16,
          alignItems: 'start',
          flex: 1,
        }}
      >
        <SourcesPanel />
        <Chat />
      </div>
    </main>
  );
}

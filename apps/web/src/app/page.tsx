import { Chat } from '@/components/chat';

export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: 880,
        margin: '0 auto',
        padding: '32px 16px',
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
      <Chat />
    </main>
  );
}

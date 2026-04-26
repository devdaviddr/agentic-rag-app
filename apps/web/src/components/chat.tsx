'use client';

import { useChat } from 'ai/react';

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: '/api/chat',
  });

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        flex: 1,
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 360,
          border: '1px solid #2a2a2c',
          borderRadius: 8,
          padding: 16,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          background: '#111',
        }}
      >
        {messages.length === 0 && (
          <p style={{ color: '#888', margin: 0 }}>
            Ask a question. The agent will search the knowledge base via tool calls.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} style={{ whiteSpace: 'pre-wrap' }}>
            <strong style={{ color: m.role === 'user' ? '#7dd3fc' : '#a7f3d0' }}>
              {m.role}:
            </strong>{' '}
            {m.content}
          </div>
        ))}
        {error && <div style={{ color: '#fca5a5' }}>Error: {error.message}</div>}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask something…"
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 6,
            border: '1px solid #2a2a2c',
            background: '#0f0f10',
            color: '#f5f5f5',
          }}
        />
        <button
          type="submit"
          disabled={isLoading}
          style={{
            padding: '10px 16px',
            borderRadius: 6,
            border: 'none',
            background: '#22d3ee',
            color: '#0b0b0c',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {isLoading ? '…' : 'Send'}
        </button>
      </form>
    </section>
  );
}

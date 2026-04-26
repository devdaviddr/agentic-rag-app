import { streamText, type CoreMessage } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { buildTools, type ToolDeps } from './tools.js';
import { SYSTEM_PROMPT } from './prompts.js';

export interface RunAgentOptions {
  baseURL: string;
  chatModel: string;
  messages: CoreMessage[];
  toolDeps: ToolDeps;
  /** Cap on tool-use rounds to prevent runaway loops. */
  maxSteps?: number;
}

export function runAgent(opts: RunAgentOptions) {
  const ollama = createOllama({ baseURL: opts.baseURL });
  const tools = buildTools(opts.toolDeps);

  return streamText({
    // `simulateStreaming: true` is required for ollama-ai-provider@1.x +
    // AI SDK v4 when using tools — native streaming + tool-calling is broken
    // upstream and surfaces as a masked "An error occurred." to the client.
    // See: https://github.com/vercel/ai/issues/4700
    model: ollama(opts.chatModel, { simulateStreaming: true }),
    system: SYSTEM_PROMPT,
    messages: opts.messages,
    tools,
    maxSteps: opts.maxSteps ?? 5,
    temperature: 0.2,
    onError: ({ error }) => {
      console.error('[agent] streamText error:', error);
    },
  });
}

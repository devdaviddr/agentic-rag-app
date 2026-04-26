import { streamText, type CoreMessage, type StepResult, type StreamTextTransform } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { normalizeOllamaBaseURL } from '@app/rag';
import { buildTools, type AgentTools, type ToolDeps } from './tools.js';
import { SYSTEM_PROMPT } from './prompts.js';

export interface RunAgentOptions {
  baseURL: string;
  chatModel: string;
  messages: CoreMessage[];
  toolDeps: ToolDeps;
  /** Cap on tool-use rounds to prevent runaway loops. */
  maxSteps?: number;
  /** Generation temperature; defaults to 0.2 (matches prior behavior). */
  temperature?: number;
  /** Optional per-step callback (used by chat route to capture tool calls). */
  onStepFinish?: (step: StepResult<AgentTools>) => void | Promise<void>;
  /** Optional stream transform — used for the §10.6 image-guarantee post-processor. */
  experimental_transform?:
    | StreamTextTransform<AgentTools>
    | Array<StreamTextTransform<AgentTools>>;
}

export function runAgent(opts: RunAgentOptions) {
  const ollama = createOllama({ baseURL: normalizeOllamaBaseURL(opts.baseURL) });
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
    temperature: opts.temperature ?? 0.2,
    onStepFinish: opts.onStepFinish,
    experimental_transform: opts.experimental_transform,
    onError: ({ error }) => {
      console.error('[agent] streamText error:', error);
    },
  });
}

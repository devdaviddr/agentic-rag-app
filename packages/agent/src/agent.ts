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
    model: ollama(opts.chatModel),
    system: SYSTEM_PROMPT,
    messages: opts.messages,
    tools,
    maxSteps: opts.maxSteps ?? 5,
    temperature: 0.2,
  });
}

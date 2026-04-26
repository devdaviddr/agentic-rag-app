import { NextRequest } from 'next/server';
import { z } from 'zod';
import type { TextStreamPart } from 'ai';
import { runAgent, type AgentTools } from '@app/agent';
import { getEmbedder } from '@/lib/embedder';
import { getSettings } from '@/lib/settings';
import {
  applyImageGuarantee,
  type ToolCallRecord,
} from '@/lib/image-guarantee';
import { logChat } from '@/lib/telemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant']),
      content: z.string(),
    }),
  ),
});

export async function POST(req: NextRequest) {
  // D7: read live settings (DB overlays env). Switching chatModel / topK /
  // temperature in /settings now actually takes effect for the next request.
  const settings = await getSettings();
  const embedder = getEmbedder();
  const body = BodySchema.parse(await req.json());

  // Capture last user message for visual-intent detection.
  const lastUser = [...body.messages].reverse().find((m) => m.role === 'user');
  const userMessage = lastUser?.content ?? '';

  // Tool-call ledger populated via onStepFinish; consumed by the
  // experimental_transform on `finish` to apply applyImageGuarantee.
  const toolCalls: ToolCallRecord[] = [];

  // Buffer all text-delta parts; on finish, replace them with the patched body.
  // This is sound because the agent runs with simulateStreaming: true — text
  // is delivered as a single batch after tool-use settles, so buffering is lossless.
  const guaranteeTransform = (): TransformStream<
    TextStreamPart<AgentTools>,
    TextStreamPart<AgentTools>
  > => {
    let buffered = '';
    return new TransformStream({
      transform(chunk, controller) {
        if (chunk.type === 'text-delta') {
          buffered += chunk.textDelta;
          // Swallow text-deltas; we re-emit a single patched delta on finish.
          return;
        }
        if (chunk.type === 'finish' || chunk.type === 'step-finish') {
          if (buffered.length > 0) {
            const { patched, injected } = applyImageGuarantee(buffered, {
              userMessage,
              toolCalls,
            });
            if (injected.reason !== 'none') {
              logChat({ event: 'image_inject', ...injected });
            }
            controller.enqueue({
              type: 'text-delta',
              textDelta: patched,
            } as TextStreamPart<AgentTools>);
            buffered = '';
          }
        }
        controller.enqueue(chunk);
      },
      flush(controller) {
        if (buffered.length > 0) {
          const { patched, injected } = applyImageGuarantee(buffered, {
            userMessage,
            toolCalls,
          });
          if (injected.reason !== 'none') {
            logChat({ event: 'image_inject', ...injected });
          }
          controller.enqueue({
            type: 'text-delta',
            textDelta: patched,
          } as TextStreamPart<AgentTools>);
        }
      },
    });
  };

  logChat({
    event: 'request',
    chatModel: settings.chatModel,
    topK: settings.ragTopK,
    temperature: settings.chatTemperature,
  });

  const result = runAgent({
    baseURL: settings.ollamaBaseUrl,
    chatModel: settings.chatModel,
    temperature: settings.chatTemperature,
    messages: body.messages,
    toolDeps: { embedder, defaultTopK: settings.ragTopK },
    onStepFinish: (step) => {
      // step.toolCalls is { toolName, args } and step.toolResults is
      // { toolName, args, result }. Prefer toolResults so we have the
      // executed return value for the post-processor.
      for (const tr of step.toolResults ?? []) {
        toolCalls.push({
          toolName: tr.toolName,
          args: tr.args,
          result: tr.result,
        });
      }
    },
    experimental_transform: guaranteeTransform,
  });

  return result.toDataStreamResponse({
    getErrorMessage: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[/api/chat] error:', error);
      return message;
    },
  });
}

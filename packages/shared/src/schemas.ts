import { z } from 'zod';

export const DocumentSchema = z.object({
  id: z.string().uuid(),
  source: z.string().min(1),
  title: z.string().nullable(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.coerce.date(),
});
export type Document = z.infer<typeof DocumentSchema>;

export const ChunkSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  ordinal: z.number().int().nonnegative(),
  content: z.string().min(1),
  tokens: z.number().int().positive().nullable(),
  metadata: z.record(z.unknown()).default({}),
});
export type Chunk = z.infer<typeof ChunkSchema>;

export const RetrievalResultSchema = z.object({
  chunkId: z.string().uuid(),
  documentId: z.string().uuid(),
  content: z.string(),
  score: z.number(),
  source: z.string(),
  title: z.string().nullable(),
});
export type RetrievalResult = z.infer<typeof RetrievalResultSchema>;

export const IngestRequestSchema = z.object({
  source: z.string().min(1),
  title: z.string().optional(),
  content: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});
export type IngestRequest = z.infer<typeof IngestRequestSchema>;

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

import { tool } from 'ai';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@app/db';
import { retrieve, retrieveFigures, type Embedder } from '@app/rag';

export interface ToolDeps {
  embedder: Embedder;
  defaultTopK: number;
}

export function buildTools(deps: ToolDeps) {
  return {
    search_kb: tool({
      description:
        'Semantic search over the knowledge base. Returns top-k chunks with source and similarity score.',
      parameters: z.object({
        query: z.string().min(1).describe('Natural-language search query.'),
        topK: z.number().int().min(1).max(20).optional(),
        sourceFilter: z
          .string()
          .optional()
          .describe('Optional substring filter on document.source.'),
      }),
      execute: async ({ query, topK, sourceFilter }) => {
        const results = await retrieve(query, {
          topK: topK ?? deps.defaultTopK,
          embedder: deps.embedder,
          sourceFilter,
        });
        return { results };
      },
    }),

    fetch_doc: tool({
      description: 'Fetch full content of a document by ID (concatenated chunks in order).',
      parameters: z.object({
        documentId: z.string().uuid(),
      }),
      execute: async ({ documentId }) => {
        const db = getDb();
        const [doc] = await db
          .select()
          .from(schema.documents)
          .where(eq(schema.documents.id, documentId))
          .limit(1);
        if (!doc) return { error: 'not_found' as const };
        const rows = await db
          .select({ ordinal: schema.chunks.ordinal, content: schema.chunks.content })
          .from(schema.chunks)
          .where(eq(schema.chunks.documentId, documentId))
          .orderBy(schema.chunks.ordinal);
        return {
          id: doc.id,
          source: doc.source,
          title: doc.title,
          content: rows.map((r) => r.content).join('\n\n'),
        };
      },
    }),

    findFigure: tool({
      description:
        'Find figures (charts, diagrams, photos, screenshots) in the knowledge base by what they show. ' +
        'Use this whenever the user asks to see, show, or describe an image, figure, chart, diagram, ' +
        'screenshot, or visual element. Returns figure refs that MUST be rendered inline as ' +
        '![alt](asset:UUID) markdown in your reply.',
      parameters: z.object({
        query: z.string().min(2),
        topK: z.number().int().min(1).max(10).optional(),
        sourceFilter: z.string().optional(),
      }),
      execute: async ({ query, topK, sourceFilter }) => {
        const hits = await retrieveFigures(query, {
          topK: topK ?? 4,
          sourceFilter,
          embedder: deps.embedder,
        });
        return {
          figures: hits.map((h) => ({
            assetMarkdown: `![${h.title ?? 'figure'} (p.${h.page})](asset:${h.id})`,
            source: h.source,
            title: h.title,
            page: h.page,
            summary: h.summary,
            score: h.score,
          })),
        };
      },
    }),

    list_sources: tool({
      description: 'List distinct document sources in the knowledge base with chunk counts.',
      parameters: z.object({
        limit: z.number().int().min(1).max(200).optional(),
      }),
      execute: async ({ limit }) => {
        const db = getDb();
        const rows = await db.execute<{ source: string; document_count: number; chunk_count: number }>(sql`
          SELECT
            d.source                     AS source,
            COUNT(DISTINCT d.id)::int    AS document_count,
            COUNT(c.id)::int             AS chunk_count
          FROM ${schema.documents} d
          LEFT JOIN ${schema.chunks} c ON c.document_id = d.id
          GROUP BY d.source
          ORDER BY chunk_count DESC
          LIMIT ${limit ?? 50}
        `);
        return { sources: rows };
      },
    }),
  };
}

export type AgentTools = ReturnType<typeof buildTools>;

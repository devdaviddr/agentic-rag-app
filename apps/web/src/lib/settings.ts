import { getSettingsRow, type AppSettingsRow } from '@app/db';
import type { ResolvedSettings } from '@app/shared';
import { getEnv } from './env.js';

const CACHE_TTL_MS = 30_000;

let cached: { value: ResolvedSettings; expiresAt: number } | null = null;

export function envDefaults(): ResolvedSettings {
  const env = getEnv();
  return {
    ollamaBaseUrl: env.OLLAMA_BASE_URL,
    chatModel: env.OLLAMA_CHAT_MODEL,
    embedModel: env.OLLAMA_EMBED_MODEL,
    visionModel: env.OLLAMA_VISION_MODEL,
    chatTemperature: 0.2,
    ragTopK: env.RAG_TOP_K,
    ragChunkSize: env.RAG_CHUNK_SIZE,
    ragChunkOverlap: env.RAG_CHUNK_OVERLAP,
  };
}

export function resolveFromRow(row: AppSettingsRow | null): ResolvedSettings {
  const defaults = envDefaults();
  if (!row) return defaults;
  return {
    ollamaBaseUrl: row.ollamaBaseUrl ?? defaults.ollamaBaseUrl,
    chatModel: row.chatModel ?? defaults.chatModel,
    embedModel: row.embedModel ?? defaults.embedModel,
    visionModel: row.visionModel ?? defaults.visionModel,
    chatTemperature: row.chatTemperature ?? defaults.chatTemperature,
    ragTopK: row.ragTopK ?? defaults.ragTopK,
    ragChunkSize: row.ragChunkSize ?? defaults.ragChunkSize,
    ragChunkOverlap: row.ragChunkOverlap ?? defaults.ragChunkOverlap,
  };
}

export async function getSettings(): Promise<ResolvedSettings> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const row = await getSettingsRow();
  const value = resolveFromRow(row);
  cached = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

export function invalidateSettingsCache(): void {
  cached = null;
}

export type Overrides = Partial<{
  ollamaBaseUrl: string | null;
  chatModel: string | null;
  embedModel: string | null;
  visionModel: string | null;
  chatTemperature: number | null;
  ragTopK: number | null;
  ragChunkSize: number | null;
  ragChunkOverlap: number | null;
}>;

export function rowToOverrides(row: AppSettingsRow | null): Overrides {
  if (!row) return {};
  const out: Overrides = {};
  if (row.ollamaBaseUrl !== null) out.ollamaBaseUrl = row.ollamaBaseUrl;
  if (row.chatModel !== null) out.chatModel = row.chatModel;
  if (row.embedModel !== null) out.embedModel = row.embedModel;
  if (row.visionModel !== null) out.visionModel = row.visionModel;
  if (row.chatTemperature !== null) out.chatTemperature = row.chatTemperature;
  if (row.ragTopK !== null) out.ragTopK = row.ragTopK;
  if (row.ragChunkSize !== null) out.ragChunkSize = row.ragChunkSize;
  if (row.ragChunkOverlap !== null) out.ragChunkOverlap = row.ragChunkOverlap;
  return out;
}

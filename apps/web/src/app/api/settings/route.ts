import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSettingsRow, upsertSettings } from '@app/db';
import {
  envDefaults,
  getSettings,
  invalidateSettingsCache,
  resolveFromRow,
  rowToOverrides,
} from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const row = await getSettingsRow();
  return NextResponse.json({
    resolved: resolveFromRow(row),
    overrides: rowToOverrides(row),
    envDefaults: envDefaults(),
  });
}

// nullable means "clear override → fall back to env"; missing key means "leave as-is"
const PatchSchema = z
  .object({
    ollamaBaseUrl: z.string().url().nullable().optional(),
    chatModel: z.string().min(1).nullable().optional(),
    embedModel: z.string().min(1).nullable().optional(),
    visionModel: z.string().min(1).nullable().optional(),
    chatTemperature: z.number().min(0).max(1).nullable().optional(),
    ragTopK: z.number().int().positive().nullable().optional(),
    ragChunkSize: z.number().int().positive().nullable().optional(),
    ragChunkOverlap: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  await upsertSettings(parsed.data);
  invalidateSettingsCache();
  const resolved = await getSettings();
  const row = await getSettingsRow();
  return NextResponse.json({
    resolved,
    overrides: rowToOverrides(row),
    envDefaults: envDefaults(),
  });
}

import { jstNow } from './utils.js';

export interface AiSettingsRow {
  id: string;
  is_enabled: number;
  system_prompt: string | null;
  model: string;
  created_at: string;
  updated_at: string;
}

export async function getAiSettings(db: D1Database): Promise<AiSettingsRow | null> {
  return db
    .prepare(`SELECT * FROM ai_settings WHERE id = 'default'`)
    .first<AiSettingsRow>();
}

export async function upsertAiSettings(
  db: D1Database,
  input: { isEnabled: boolean; systemPrompt?: string | null; model?: string },
): Promise<AiSettingsRow> {
  const now = jstNow();
  const model = input.model ?? 'claude-haiku-4-5';
  await db
    .prepare(
      `INSERT INTO ai_settings (id, is_enabled, system_prompt, model, created_at, updated_at)
       VALUES ('default', ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         is_enabled    = excluded.is_enabled,
         system_prompt = excluded.system_prompt,
         model         = excluded.model,
         updated_at    = excluded.updated_at`,
    )
    .bind(input.isEnabled ? 1 : 0, input.systemPrompt ?? null, model, now, now)
    .run();
  return (await getAiSettings(db))!;
}

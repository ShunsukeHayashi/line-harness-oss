import { Hono } from 'hono';
import { getAiSettings, upsertAiSettings } from '@line-crm/db';
import type { Env } from '../index.js';

const aiSettings = new Hono<Env>();

// GET /api/ai-settings — 現在のAI自動応答設定を返す
aiSettings.get('/api/ai-settings', async (c) => {
  const db = c.env.DB;
  const row = await getAiSettings(db);
  if (!row) {
    return c.json({
      success: true,
      data: {
        id: 'default',
        isEnabled: false,
        systemPrompt: null,
        model: 'claude-haiku-4-5',
        createdAt: '',
        updatedAt: '',
      },
    });
  }
  return c.json({
    success: true,
    data: {
      id: row.id,
      isEnabled: row.is_enabled === 1,
      systemPrompt: row.system_prompt,
      model: row.model,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
});

// PUT /api/ai-settings — AI自動応答設定を更新する
aiSettings.put('/api/ai-settings', async (c) => {
  let body: { isEnabled?: boolean; systemPrompt?: string | null; model?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'リクエスト形式が不正です' }, 400);
  }

  if (typeof body.isEnabled !== 'boolean') {
    return c.json({ success: false, error: 'isEnabled (boolean) は必須です' }, 400);
  }

  const db = c.env.DB;
  const row = await upsertAiSettings(db, {
    isEnabled: body.isEnabled,
    systemPrompt: body.systemPrompt ?? null,
    model: body.model,
  });

  return c.json({
    success: true,
    data: {
      id: row.id,
      isEnabled: row.is_enabled === 1,
      systemPrompt: row.system_prompt,
      model: row.model,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
});

export { aiSettings };

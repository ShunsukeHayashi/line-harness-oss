-- Migration 011: AI auto-reply settings
-- Run: wrangler d1 execute line-crm --file=packages/db/migrations/011_ai_settings.sql --remote

CREATE TABLE IF NOT EXISTS ai_settings (
  id             TEXT PRIMARY KEY DEFAULT 'default',
  is_enabled     INTEGER NOT NULL DEFAULT 0,
  system_prompt  TEXT,
  model          TEXT NOT NULL DEFAULT 'claude-haiku-4-5',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

-- Insert default row (disabled by default)
INSERT OR IGNORE INTO ai_settings (id, is_enabled, system_prompt, model)
VALUES ('default', 0, NULL, 'claude-haiku-4-5');

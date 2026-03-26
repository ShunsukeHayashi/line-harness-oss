-- Migration 011: unified_profiles テーブル (PPAL Identity Hub)
-- NO TRIGGER: app layer handles updated_at via jstNow() in all INSERT/UPDATE statements
-- (apps/worker/src/routes/liff.ts, webhook.ts パターン参照)
-- D1 SQLite では AFTER/BEFORE UPDATE trigger が再帰崩壊するため trigger は使用しない

CREATE TABLE IF NOT EXISTS unified_profiles (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  line_uid         TEXT UNIQUE NOT NULL,
  teachable_id     INTEGER,
  teachable_email  TEXT,
  discord_id       TEXT,
  discord_username TEXT,
  discord_roles    TEXT CHECK(discord_roles IS NULL OR json_valid(discord_roles)),
  linked_at        TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

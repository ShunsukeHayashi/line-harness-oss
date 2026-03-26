-- Migration 011: PPAL Identity Hub — unified_profiles table
-- line_uid を唯一の主キーとして Teachable / Discord アカウントを1テーブルで管理する
-- Run: wrangler d1 execute line-crm --file=packages/db/migrations/011_unified_profiles.sql --remote

CREATE TABLE IF NOT EXISTS unified_profiles (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  line_uid         TEXT UNIQUE NOT NULL,
  teachable_id     INTEGER,
  teachable_email  TEXT,
  discord_id       TEXT,
  discord_username TEXT,
  discord_roles    TEXT,
  linked_at        TEXT,
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_unified_teachable_id    ON unified_profiles(teachable_id);
CREATE INDEX IF NOT EXISTS idx_unified_discord_id      ON unified_profiles(discord_id);
CREATE INDEX IF NOT EXISTS idx_unified_teachable_email ON unified_profiles(teachable_email);

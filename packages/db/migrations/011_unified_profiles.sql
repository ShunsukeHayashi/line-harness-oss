-- Migration 011: Add unified_profiles table for PPAL Identity Hub
-- Manages LINE / Teachable / Discord account linkage in a single table.
-- Run: wrangler d1 execute line-crm --file=packages/db/migrations/011_unified_profiles.sql --remote

CREATE TABLE IF NOT EXISTS unified_profiles (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  line_uid          TEXT UNIQUE NOT NULL,   -- LINE user ID (primary identity)
  teachable_id      INTEGER,               -- Teachable user ID
  teachable_email   TEXT,                  -- Teachable registered email
  discord_id        TEXT,                  -- Discord user ID
  discord_username  TEXT,                  -- Discord display name (informational)
  discord_roles     TEXT,                  -- Granted roles (JSON array)
  linked_at         TEXT,                  -- Timestamp when linking completed
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_unified_teachable_id    ON unified_profiles(teachable_id);
CREATE INDEX IF NOT EXISTS idx_unified_discord_id      ON unified_profiles(discord_id);
CREATE INDEX IF NOT EXISTS idx_unified_teachable_email ON unified_profiles(teachable_email);

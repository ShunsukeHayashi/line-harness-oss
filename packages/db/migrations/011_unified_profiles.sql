-- 011_unified_profiles.sql
-- PPAL Identity Hub: unified identity table linking LINE, Discord, Teachable accounts

CREATE TABLE IF NOT EXISTS unified_profiles (
  id           TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  line_uid     TEXT    NOT NULL UNIQUE,
  discord_id   TEXT,
  discord_username TEXT,
  teachable_email  TEXT,
  linked_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_unified_profiles_discord_id ON unified_profiles (discord_id);
CREATE INDEX IF NOT EXISTS idx_unified_profiles_teachable_email ON unified_profiles (teachable_email);

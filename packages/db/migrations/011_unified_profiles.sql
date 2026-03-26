-- Migration 011: unified_profiles (Teachable × LINE Identity Hub)
-- Stores Teachable purchaser profiles pending LINE account linkage

CREATE TABLE IF NOT EXISTS unified_profiles (
  id               TEXT PRIMARY KEY,
  teachable_email  TEXT NOT NULL UNIQUE,
  teachable_id     TEXT,
  line_user_id     TEXT,
  line_message_sent_at TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_unified_profiles_email    ON unified_profiles (teachable_email);
CREATE INDEX IF NOT EXISTS idx_unified_profiles_line_uid ON unified_profiles (line_user_id);

-- Add teachable_email column to friends so LINE friends can be looked up by email
ALTER TABLE friends ADD COLUMN teachable_email TEXT;
CREATE INDEX IF NOT EXISTS idx_friends_teachable_email ON friends (teachable_email);

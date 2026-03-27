-- migration 011: AI consent columns for friends table
ALTER TABLE friends ADD COLUMN ai_consent INTEGER DEFAULT 0;
ALTER TABLE friends ADD COLUMN ai_consent_updated_at TEXT;

-- Migration 012: enforce 1:1 Discord ↔ LINE identity mapping at the DB level
-- Replaces the non-unique index on discord_id with a partial unique index.
-- NULLs are excluded (WHERE clause) so un-linked rows do not conflict.
-- This backs the application-layer check in apps/worker/src/routes/liff.ts.

DROP INDEX IF EXISTS idx_unified_profiles_discord_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unified_profiles_discord_id
  ON unified_profiles(discord_id)
  WHERE discord_id IS NOT NULL;

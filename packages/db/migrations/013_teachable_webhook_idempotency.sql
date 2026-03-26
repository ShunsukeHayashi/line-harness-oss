-- Migration 013: add line_message_sent_at to unified_profiles for Teachable webhook idempotency
-- Prevents duplicate LINE messages when Teachable retries a sale.created webhook.
-- NULL = message not yet sent; non-NULL = message already dispatched.
ALTER TABLE unified_profiles ADD COLUMN line_message_sent_at TEXT;

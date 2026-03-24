-- Rate limit log table (sliding window, keyed by prefix:ip)
CREATE TABLE IF NOT EXISTS rate_limit_log (
  key       TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_log_key_ts ON rate_limit_log (key, timestamp);

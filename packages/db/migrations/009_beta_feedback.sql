-- Beta feedback table — collects structured feedback from beta testers
CREATE TABLE IF NOT EXISTS beta_feedback (
  id               TEXT    PRIMARY KEY,
  -- Submitter info (all optional for anonymous feedback)
  display_name     TEXT,
  email            TEXT,
  line_user_id     TEXT,
  -- Feedback content
  category         TEXT    NOT NULL DEFAULT 'general',
  -- 'bug' | 'feature' | 'ux' | 'performance' | 'general'
  rating           INTEGER CHECK (rating BETWEEN 1 AND 5),
  title            TEXT    NOT NULL,
  body             TEXT    NOT NULL,
  -- Context
  page_context     TEXT,   -- which feature/page the feedback is about
  -- GitHub integration
  github_issue_number  INTEGER,
  github_issue_url     TEXT,
  -- Workflow status
  status           TEXT    NOT NULL DEFAULT 'open',
  -- 'open' | 'in_review' | 'resolved' | 'wontfix'
  created_at       TEXT    NOT NULL DEFAULT (datetime('now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_beta_feedback_status   ON beta_feedback (status);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_category ON beta_feedback (category);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_created  ON beta_feedback (created_at DESC);

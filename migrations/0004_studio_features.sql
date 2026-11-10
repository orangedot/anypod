-- 0004_studio_features.sql
-- Scheduled publishing, private tokenized subscriber feeds, and custom domains

-- 1. Scheduled Publishing & Lifecycle Status
ALTER TABLE episodes ADD COLUMN status TEXT DEFAULT 'published';
ALTER TABLE episodes ADD COLUMN scheduled_for INTEGER;

CREATE INDEX IF NOT EXISTS idx_episodes_scheduled ON episodes(show_id, status, scheduled_for);

-- 2. Private Feeds & Custom Domains in Shows
ALTER TABLE shows ADD COLUMN is_private INTEGER DEFAULT 0;
ALTER TABLE shows ADD COLUMN auth_type TEXT DEFAULT 'token';
ALTER TABLE shows ADD COLUMN custom_domain TEXT;
ALTER TABLE shows ADD COLUMN custom_domain_status TEXT DEFAULT 'none';

CREATE INDEX IF NOT EXISTS idx_shows_custom_domain ON shows(custom_domain);

-- 3. Tokenized Subscriber Feeds (ICPS / Subscriber Gating)
CREATE TABLE IF NOT EXISTS show_feed_tokens (
  id TEXT PRIMARY KEY,
  show_id TEXT NOT NULL,
  subscriber_label TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  token_preview TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  expires_at INTEGER,
  revoked_at INTEGER,
  FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feed_tokens_lookup ON show_feed_tokens(show_id, token_hash);

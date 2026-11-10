CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  last_active_at INTEGER,
  warned_30d_at INTEGER,
  warned_50d_at INTEGER,
  studio_plan TEXT DEFAULT 'free',
  studio_plan_until INTEGER,
  listener_plan TEXT DEFAULT 'free',
  listener_plan_until INTEGER
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_sessions (
  session_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  title TEXT,
  artwork TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, feed_url),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS playback_state (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  episode_guid TEXT NOT NULL,
  position_seconds REAL DEFAULT 0,
  completed INTEGER DEFAULT 0,
  last_listened_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, episode_guid),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS episode_transcripts (
  episode_guid TEXT PRIMARY KEY,
  feed_url TEXT,
  duration REAL DEFAULT 0,
  bars_json TEXT,
  segments_json TEXT,
  transcript_url TEXT,
  source TEXT DEFAULT 'probe',
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  episode_guid TEXT NOT NULL,
  feed_url TEXT,
  title TEXT,
  podcast_title TEXT,
  artwork TEXT,
  audio_url TEXT,
  duration TEXT,
  pub_date TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, episode_guid),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  endpoint TEXT NOT NULL,
  target_param TEXT,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  cache_status TEXT
);
CREATE INDEX IF NOT EXISTS idx_req_logs_created_at ON api_request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_req_logs_endpoint ON api_request_logs(endpoint);

CREATE TABLE IF NOT EXISTS shows (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  author TEXT,
  email TEXT,
  cover_image_url TEXT,
  language TEXT DEFAULT 'en',
  category TEXT,
  explicit INTEGER DEFAULT 0,
  website_url TEXT,
  is_private INTEGER DEFAULT 0,
  auth_type TEXT DEFAULT 'token',
  custom_domain TEXT,
  custom_domain_status TEXT DEFAULT 'none',
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shows_slug ON shows(slug);
CREATE INDEX IF NOT EXISTS idx_shows_custom_domain ON shows(custom_domain);

CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  show_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  audio_key TEXT NOT NULL,
  audio_content_type TEXT DEFAULT 'audio/mpeg',
  audio_byte_size INTEGER NOT NULL DEFAULT 0,
  duration_seconds REAL DEFAULT 0,
  episode_number INTEGER,
  season_number INTEGER,
  episode_type TEXT DEFAULT 'full',
  explicit INTEGER DEFAULT 0,
  transcript_key TEXT,
  chapters_key TEXT,
  waveform_peaks_json TEXT,
  status TEXT DEFAULT 'published',
  scheduled_for INTEGER,
  published_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_episodes_show_published ON episodes(show_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_scheduled ON episodes(show_id, status, scheduled_for);

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




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
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shows_slug ON shows(slug);

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
  published_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_episodes_show_published ON episodes(show_id, published_at DESC);

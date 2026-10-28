-- kimo API schema v3: editing sessions on the free plan.
-- Media never reaches the server: an asset row is only the file's name,
-- size, type and probed duration, so a reopened project can ask the user
-- to add the same clips again. Timelines are JSON edit metadata.
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  duration_sec REAL,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assets_user ON assets (user_id);

CREATE TABLE IF NOT EXISTS edit_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'editing',
  version INTEGER NOT NULL DEFAULT 0,
  project_json TEXT NOT NULL,
  asset_ids TEXT NOT NULL DEFAULT '[]',
  -- The landing prompt, run as the first AI edit once the studio has
  -- measured the clips; cleared after that first edit.
  pending_prompt TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS edit_sessions_user ON edit_sessions (user_id);

-- Numbers measured in the browser (speech/silence ranges, loudness, music
-- beats). Metadata only; the audio itself never leaves the tab.
CREATE TABLE IF NOT EXISTS asset_analysis (
  asset_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Applied mutation ids, so a retried edit is never applied twice.
CREATE TABLE IF NOT EXISTS session_mutations (
  session_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id, mutation_id)
);

ALTER TABLE daily_usage ADD COLUMN ai_edits INTEGER NOT NULL DEFAULT 0;

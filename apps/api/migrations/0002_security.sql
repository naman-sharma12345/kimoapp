-- kimo API schema v2: PKCE + nonce on OAuth states, linked identities
-- (sign in with GitHub or Google into one account by verified email),
-- the provider used for each session, and free D1-backed rate limits.
ALTER TABLE oauth_states ADD COLUMN code_verifier TEXT NOT NULL DEFAULT '';
ALTER TABLE oauth_states ADD COLUMN nonce TEXT NOT NULL DEFAULT '';
ALTER TABLE auth_sessions ADD COLUMN provider TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS user_identities (
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  PRIMARY KEY (provider, provider_id)
);
CREATE INDEX IF NOT EXISTS user_identities_user ON user_identities (user_id);
INSERT OR IGNORE INTO user_identities (provider, provider_id, user_id, email, created_at, last_used_at)
  SELECT provider, provider_id, id, email, created_at, updated_at FROM users;

CREATE INDEX IF NOT EXISTS users_email ON users (email);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

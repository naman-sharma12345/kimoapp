-- Token counts for AI calls made on kimo's own key (never prompts, media or replies).
CREATE TABLE IF NOT EXISTS ai_spend (
  day TEXT NOT NULL,
  model TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, model)
);

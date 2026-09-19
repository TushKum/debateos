-- DebateOS schema. Safe to re-run: every statement is idempotent.

-- ───────────── Users & auth ─────────────
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS circuit_role VARCHAR(30) NOT NULL DEFAULT 'debater';
ALTER TABLE users ADD COLUMN IF NOT EXISTS institution VARCHAR(160);
ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS login_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  logged_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_login_events_logged_in_at ON login_events(logged_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_events_user_id ON login_events(user_id);

-- ───────────── Debate network ─────────────
CREATE TABLE IF NOT EXISTS connections (
  id BIGSERIAL PRIMARY KEY,
  requester_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(sender_id, recipient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, read_at);

-- ───────────── AI arena ─────────────
CREATE TABLE IF NOT EXISTS ai_debates (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  format VARCHAR(30) NOT NULL,
  motion TEXT NOT NULL,
  transcript JSONB NOT NULL DEFAULT '[]',
  report JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_debates_user ON ai_debates(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_day ON ai_usage(user_id, created_at);

-- Admin-curated reference material (manual notes, final transcripts, matter files)
-- that is added to the AI's instructions.
CREATE TABLE IF NOT EXISTS ai_knowledge (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  source_url TEXT,
  content TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ───────────── Tab (tournament hosting) ─────────────
CREATE TABLE IF NOT EXISTS tournaments (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  format VARCHAR(10) NOT NULL CHECK (format IN ('bp', 'twoteam')),
  speakers_per_team SMALLINT NOT NULL DEFAULT 2,
  description TEXT,
  starts_on DATE,
  discord_url TEXT,
  meet_url TEXT,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  tab_released BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournament_staff (
  tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(12) NOT NULL CHECK (role IN ('tab', 'cap', 'equity')),
  PRIMARY KEY (tournament_id, user_id, role)
);

CREATE TABLE IF NOT EXISTS teams (
  id BIGSERIAL PRIMARY KEY,
  tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  institution VARCHAR(160),
  code CHAR(8) NOT NULL DEFAULT substr(md5(random()::text), 1, 8)
);

CREATE TABLE IF NOT EXISTS speakers (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS adjudicators (
  id BIGSERIAL PRIMARY KEY,
  tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  institution VARCHAR(160),
  email VARCHAR(255),
  rating NUMERIC(3,1) NOT NULL DEFAULT 5.0,
  is_ia BOOLEAN NOT NULL DEFAULT FALSE,
  code CHAR(8) NOT NULL DEFAULT substr(md5(random()::text), 1, 8)
);

CREATE TABLE IF NOT EXISTS venues (
  id BIGSERIAL PRIMARY KEY,
  tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  meet_url TEXT,
  discord_url TEXT
);

CREATE TABLE IF NOT EXISTS rounds (
  id BIGSERIAL PRIMARY KEY,
  tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  seq SMALLINT NOT NULL,
  name VARCHAR(60) NOT NULL,
  motion TEXT,
  infoslide TEXT,
  draw_released BOOLEAN NOT NULL DEFAULT FALSE,
  motion_released BOOLEAN NOT NULL DEFAULT FALSE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (tournament_id, seq)
);

CREATE TABLE IF NOT EXISTS debates (
  id BIGSERIAL PRIMARY KEY,
  round_id BIGINT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  venue_id BIGINT REFERENCES venues(id) ON DELETE SET NULL,
  bracket NUMERIC(6,2) NOT NULL DEFAULT 0,
  result_entered BOOLEAN NOT NULL DEFAULT FALSE
);

-- position: OG/OO/CG/CO for BP, GOV/OPP for two-team formats.
-- points: BP 3/2/1/0 for 1st-4th; two-team 1 for a win, 0 for a loss.
CREATE TABLE IF NOT EXISTS debate_teams (
  debate_id BIGINT NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  position VARCHAR(4) NOT NULL,
  points SMALLINT,
  PRIMARY KEY (debate_id, team_id)
);

CREATE TABLE IF NOT EXISTS debate_adjudicators (
  debate_id BIGINT NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  adjudicator_id BIGINT NOT NULL REFERENCES adjudicators(id) ON DELETE CASCADE,
  role VARCHAR(8) NOT NULL CHECK (role IN ('chair', 'panel', 'trainee')),
  PRIMARY KEY (debate_id, adjudicator_id)
);

-- speech_order is the speaker's slot within the team (1..n; n+1 = reply speech).
CREATE TABLE IF NOT EXISTS speaker_scores (
  debate_id BIGINT NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  speaker_id BIGINT NOT NULL REFERENCES speakers(id) ON DELETE CASCADE,
  speech_order SMALLINT NOT NULL,
  score NUMERIC(4,1) NOT NULL,
  PRIMARY KEY (debate_id, speech_order, speaker_id)
);

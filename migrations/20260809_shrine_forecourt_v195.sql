-- V195 authoritative forecourt coin ledger. Additive only; content 046 is immutable.
-- All quota/reset decisions use server time and the frozen timezone on each cycle.

CREATE UNIQUE INDEX IF NOT EXISTS uq_shrine_hourkey_results_owner_id_ritual
  ON shrine_hourkey_ritual_results(user_id, id, ritual_id);

CREATE TABLE IF NOT EXISTS shrine_forecourt_daily_cycles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_no bigint NOT NULL CHECK (cycle_no > 0),
  local_day date NOT NULL,
  timezone_name varchar(80) NOT NULL CHECK (length(timezone_name) BETWEEN 1 AND 80),
  utc_offset_minutes smallint NOT NULL CHECK (utc_offset_minutes BETWEEN -840 AND 840),
  started_at timestamptz NOT NULL,
  next_reset_at timestamptz NOT NULL,
  policy_version varchar(32) NOT NULL
    CHECK (policy_version = 'forecourt-authority-v1'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (next_reset_at >= started_at + interval '20 hours'),
  UNIQUE (user_id, cycle_no),
  UNIQUE (user_id, id)
);

CREATE TABLE IF NOT EXISTS shrine_forecourt_throw_authorizations (
  id varchar(39) PRIMARY KEY CHECK (id ~ '^throw_[0-9a-f]{32}$'),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_id uuid NOT NULL,
  ordinal smallint NOT NULL CHECK (ordinal BETWEEN 1 AND 4),
  idempotency_key varchar(41) NOT NULL
    CHECK (idempotency_key ~ '^foreprep_[0-9a-f]{32}$'),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  ticket_hash char(64) NOT NULL CHECK (ticket_hash ~ '^[0-9a-f]{64}$'),
  content_id varchar(32) NOT NULL CHECK (content_id = 'mainhall-20260809-046'),
  scene_sha256 char(64) NOT NULL
    CHECK (scene_sha256 = 'dedfde2c76033334cff27082e681946f3aae43eade5bb636e57e5a51fae2278e'),
  physics_schema varchar(32) NOT NULL CHECK (physics_schema = 'forecourt-coin-v2'),
  locale varchar(2) NOT NULL CHECK (locale IN ('th','en','zh','cn','vi','ja','ru','ko','es')),
  launch_json jsonb NOT NULL CHECK (jsonb_typeof(launch_json) = 'object'),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  result_json jsonb NOT NULL CHECK (jsonb_typeof(result_json) = 'object'),
  CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '15 minutes'),
  UNIQUE (user_id, idempotency_key),
  UNIQUE (day_id, ordinal),
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, day_id)
    REFERENCES shrine_forecourt_daily_cycles(user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shrine_forecourt_throw_commits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_id uuid NOT NULL,
  throw_id varchar(39) NOT NULL,
  idempotency_key varchar(43) NOT NULL
    CHECK (idempotency_key ~ '^forecommit_[0-9a-f]{32}$'),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  locale varchar(2) NOT NULL CHECK (locale IN ('th','en','zh','cn','vi','ja','ru','ko','es')),
  reported_impact varchar(8) NOT NULL
    CHECK (reported_impact IN ('Navel','Budai','Stone','Water','Ground')),
  authoritative_impact varchar(8) NOT NULL
    CHECK (authoritative_impact IN ('Navel','Budai','Stone','Water','Ground')),
  surface_id varchar(64) NOT NULL
    CHECK (surface_id IN ('budai.navel','budai.body','basin.stone','basin.water','forecourt.ground')),
  evidence_json jsonb NOT NULL CHECK (jsonb_typeof(evidence_json) = 'object'),
  result_json jsonb NOT NULL CHECK (jsonb_typeof(result_json) = 'object'),
  committed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  UNIQUE (throw_id),
  FOREIGN KEY (user_id, day_id)
    REFERENCES shrine_forecourt_daily_cycles(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, throw_id)
    REFERENCES shrine_forecourt_throw_authorizations(user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shrine_forecourt_recovery_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_id uuid NOT NULL UNIQUE,
  source_result_id uuid NOT NULL UNIQUE,
  source_ritual_id varchar(32) NOT NULL
    CHECK (source_ritual_id IN ('forecourt-bell','forecourt-drum','east-garden-wish-tie')),
  awarded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, day_id)
    REFERENCES shrine_forecourt_daily_cycles(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, source_result_id, source_ritual_id)
    REFERENCES shrine_hourkey_ritual_results(user_id, id, ritual_id)
);

CREATE TABLE IF NOT EXISTS shrine_forecourt_blessings (
  id varchar(36) PRIMARY KEY CHECK (id ~ '^bls_[0-9a-f]{32}$'),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_id uuid NOT NULL UNIQUE,
  throw_id varchar(39) NOT NULL UNIQUE,
  locale varchar(2) NOT NULL CHECK (locale IN ('th','en','zh','cn','vi','ja','ru','ko','es')),
  result_code varchar(64) NOT NULL
    CHECK (result_code = 'forecourt-first-daily-navel-v1'),
  display_json jsonb NOT NULL CHECK (
    jsonb_typeof(display_json) = 'object'
    AND jsonb_typeof(display_json->'title') = 'string'
    AND jsonb_typeof(display_json->'body') = 'string'
    AND jsonb_typeof(display_json->'footer') = 'string'
    AND char_length(display_json->>'title') BETWEEN 1 AND 120
    AND char_length(display_json->>'body') BETWEEN 1 AND 360
    AND char_length(display_json->>'footer') BETWEEN 1 AND 180
  ),
  voice_json jsonb CHECK (
    voice_json IS NULL OR (
      jsonb_typeof(voice_json) = 'object'
      AND voice_json->>'mode' = 'asset'
      AND voice_json->>'profileId' = 'budai-warm-v1'
      AND voice_json->>'mimeType' = 'audio/mpeg'
      AND voice_json->>'sha256' ~ '^[0-9a-f]{64}$'
      AND (voice_json->>'durationMs')::int BETWEEN 700 AND 15000
      AND voice_json->>'url' ~ '^https://'
    )
  ),
  awarded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, day_id)
    REFERENCES shrine_forecourt_daily_cycles(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, throw_id)
    REFERENCES shrine_forecourt_throw_authorizations(user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_forecourt_cycles_user_reset
  ON shrine_forecourt_daily_cycles(user_id, next_reset_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecourt_authorizations_owner_day
  ON shrine_forecourt_throw_authorizations(user_id, day_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_forecourt_commits_owner_impact
  ON shrine_forecourt_throw_commits(user_id, authoritative_impact, committed_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecourt_recovery_owner_day
  ON shrine_forecourt_recovery_awards(user_id, day_id);

REVOKE ALL PRIVILEGES ON TABLE shrine_forecourt_daily_cycles FROM PUBLIC, hourkey_app;
REVOKE ALL PRIVILEGES ON TABLE shrine_forecourt_throw_authorizations FROM PUBLIC, hourkey_app;
REVOKE ALL PRIVILEGES ON TABLE shrine_forecourt_throw_commits FROM PUBLIC, hourkey_app;
REVOKE ALL PRIVILEGES ON TABLE shrine_forecourt_recovery_awards FROM PUBLIC, hourkey_app;
REVOKE ALL PRIVILEGES ON TABLE shrine_forecourt_blessings FROM PUBLIC, hourkey_app;
GRANT SELECT, INSERT ON shrine_forecourt_daily_cycles TO hourkey_app;
GRANT SELECT, INSERT ON shrine_forecourt_throw_authorizations TO hourkey_app;
GRANT SELECT, INSERT ON shrine_forecourt_throw_commits TO hourkey_app;
GRANT SELECT, INSERT ON shrine_forecourt_recovery_awards TO hourkey_app;
GRANT SELECT, INSERT ON shrine_forecourt_blessings TO hourkey_app;

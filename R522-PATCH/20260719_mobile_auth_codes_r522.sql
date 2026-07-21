-- R522: one-time auth code สำหรับสะพาน Google OAuth มือถือ (PKCE S256)
-- แลกได้ครั้งเดียว · อายุ 60 วิ · ล้างแถวเก่าด้วย cleanup ตอน exchange
BEGIN;

CREATE TABLE IF NOT EXISTS mobile_auth_codes (
  code           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_challenge text NOT NULL CHECK (length(code_challenge) BETWEEN 43 AND 128),
  created_at     timestamptz NOT NULL DEFAULT now(),
  used_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_mobile_auth_codes_created
  ON mobile_auth_codes (created_at);

REVOKE ALL ON mobile_auth_codes FROM hourkey_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON mobile_auth_codes TO hourkey_app;

COMMENT ON TABLE mobile_auth_codes IS 'R522 mobile Google OAuth bridge: one-time exchange codes (PKCE S256, 60s TTL).';

COMMIT;

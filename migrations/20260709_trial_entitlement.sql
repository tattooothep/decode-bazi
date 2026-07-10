-- Trial 30 วัน + free yam 1000 (สมัครใหม่)
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- default ยามแรกเข้า 1000 (ของเก่ายอดเดิมไม่ถูกแตะ)
ALTER TABLE users ALTER COLUMN hour_balance SET DEFAULT 1000;

CREATE INDEX IF NOT EXISTS ix_users_trial_ends_at
  ON users (trial_ends_at) WHERE trial_ends_at IS NOT NULL;

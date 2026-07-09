-- Affiliate Pilot 100% · additive schema only
-- User-facing referral + admin approval ledger + payout audit.

CREATE TABLE IF NOT EXISTS affiliate_members (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code          varchar(32) UNIQUE NOT NULL,
  status        varchar(16) NOT NULL DEFAULT 'requested',
  payout_kind   varchar(24) NOT NULL DEFAULT 'manual_cash',
  payout_note   text,
  tax_profile   jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes         text,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  approved_at   timestamptz,
  approved_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_members_status_chk
    CHECK (status IN ('requested','active','suspended','rejected')),
  CONSTRAINT affiliate_members_payout_kind_chk
    CHECK (payout_kind IN ('manual_cash','manual_credit','none'))
);

CREATE INDEX IF NOT EXISTS idx_affiliate_members_status
  ON affiliate_members(status, requested_at DESC);

CREATE TABLE IF NOT EXISTS affiliate_attributions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referred_user_id  uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referrer_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code              varchar(32) NOT NULL,
  status            varchar(16) NOT NULL DEFAULT 'active',
  channel           varchar(32),
  source_path       text,
  ip_hash           varchar(80),
  user_agent_hash   varchar(80),
  device_hash       varchar(80),
  fraud_flags       jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejected_reason   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_attributions_status_chk
    CHECK (status IN ('active','flagged','rejected','cancelled')),
  CONSTRAINT affiliate_no_self_referral_chk
    CHECK (referred_user_id <> referrer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_attributions_referrer
  ON affiliate_attributions(referrer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_attributions_status
  ON affiliate_attributions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_attributions_code
  ON affiliate_attributions(code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_attributions_device
  ON affiliate_attributions(device_hash)
  WHERE device_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS affiliate_rewards (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             uuid UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  attribution_id        uuid NOT NULL REFERENCES affiliate_attributions(id) ON DELETE RESTRICT,
  referrer_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_thb            integer NOT NULL DEFAULT 0,
  net_amount_thb        integer NOT NULL DEFAULT 0,
  commission_rate_bps   integer NOT NULL DEFAULT 0,
  commission_thb        integer NOT NULL DEFAULT 0,
  status                varchar(16) NOT NULL DEFAULT 'pending',
  hold_until            timestamptz NOT NULL,
  guard                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_at           timestamptz,
  approved_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  paid_at               timestamptz,
  paid_by               uuid REFERENCES users(id) ON DELETE SET NULL,
  payout_ref            text,
  reversed_at           timestamptz,
  reversed_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  reversal_reason       text,
  admin_note            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_rewards_status_chk
    CHECK (status IN ('pending','approved','paid','reversed','cancelled','blocked')),
  CONSTRAINT affiliate_rewards_positive_chk
    CHECK (amount_thb >= 0 AND net_amount_thb >= 0 AND commission_thb >= 0 AND commission_rate_bps >= 0)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_rewards_referrer
  ON affiliate_rewards(referrer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_rewards_referred
  ON affiliate_rewards(referred_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_rewards_status
  ON affiliate_rewards(status, hold_until, created_at DESC);

CREATE TABLE IF NOT EXISTS affiliate_audit_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  target_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  order_id        uuid REFERENCES orders(id) ON DELETE SET NULL,
  reward_id       uuid REFERENCES affiliate_rewards(id) ON DELETE SET NULL,
  event_type      varchar(80) NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_audit_events_created
  ON affiliate_audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_audit_events_type
  ON affiliate_audit_events(event_type, created_at DESC);

INSERT INTO app_settings(key, value) VALUES
  ('affiliate_pilot_enabled', 'on'),
  ('affiliate_hold_days', '14'),
  ('affiliate_topup_bps', '1000'),
  ('affiliate_subscription_bps', '1500'),
  ('affiliate_annual_bps', '1800'),
  ('affiliate_min_order_thb', '50'),
  ('affiliate_max_commission_per_order_thb', '2000'),
  ('affiliate_ip_velocity_limit', '5')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE affiliate_members IS 'Pilot allowlist and payout profile for direct affiliates.';
COMMENT ON TABLE affiliate_attributions IS 'One direct referrer attribution per newly-created user.';
COMMENT ON TABLE affiliate_rewards IS 'Commission ledger. Rewards start pending after paid order and require hold/approval/manual payout.';
COMMENT ON TABLE affiliate_audit_events IS 'Append-only audit trail for affiliate decisions, fraud flags, approvals, payouts, and reversals.';

BEGIN;

CREATE TABLE IF NOT EXISTS shrine_offering_grants (
  id uuid PRIMARY KEY,
  purchase_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id text NOT NULL
    CHECK (item_id IN ('auspiciousLamp','teaFruitOffering','talisman','vowFulfillment')),
  state text NOT NULL DEFAULT 'purchased'
    CHECK (state IN ('purchased','offered')),
  catalog_revision varchar(128) NOT NULL,
  charged_yam integer NOT NULL CHECK (charged_yam > 0),
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  idempotency_key varchar(39) NOT NULL
    CHECK (idempotency_key ~ '^shrine_[0-9a-f]{32}$'),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  offered_at timestamptz,
  CHECK ((state='purchased' AND offered_at IS NULL)
      OR (state='offered' AND offered_at IS NOT NULL)),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_shrine_offering_grants_user_state
  ON shrine_offering_grants(user_id, state, item_id, purchased_at DESC);

-- 26 ก.ค. 2569: ตัด partial unique index (user_id,item_id) WHERE state='purchased' ออก
-- แอพมือถือรองรับซื้อของชนิดเดิมซ้ำหลายชิ้น (นับ quantity จากจำนวน grant)
-- ตาม diagnosis RC3 ใน user-feedback-shop-bag-diagnosis.md

CREATE OR REPLACE FUNCTION enforce_shrine_offering_grant_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state=OLD.state
     AND NEW.offered_at IS NOT DISTINCT FROM OLD.offered_at THEN
    RETURN NEW;
  END IF;
  IF OLD.state='purchased' AND NEW.state='offered'
     AND OLD.offered_at IS NULL AND NEW.offered_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid_shrine_offering_grant_transition'
    USING ERRCODE='23514';
END;
$$;

DROP TRIGGER IF EXISTS shrine_offering_grant_transition
  ON shrine_offering_grants;
CREATE TRIGGER shrine_offering_grant_transition
BEFORE UPDATE OF state, offered_at ON shrine_offering_grants
FOR EACH ROW
EXECUTE FUNCTION enforce_shrine_offering_grant_transition();

REVOKE ALL PRIVILEGES ON TABLE shrine_offering_grants FROM hourkey_app;
GRANT SELECT, INSERT ON shrine_offering_grants TO hourkey_app;
GRANT UPDATE (state, offered_at) ON shrine_offering_grants TO hourkey_app;

COMMIT;

CREATE TABLE IF NOT EXISTS mobile_uploads (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  profile_id uuid NULL,
  original_name text NOT NULL,
  storage_path text NOT NULL,
  mime text NOT NULL,
  kind text NOT NULL,
  size_bytes integer NOT NULL,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_mobile_uploads_user_created
  ON mobile_uploads (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mobile_uploads_org_created
  ON mobile_uploads (org_id, created_at DESC)
  WHERE deleted_at IS NULL;

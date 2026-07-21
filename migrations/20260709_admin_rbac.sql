-- Platform admin RBAC (additive) · separate from org_members product roles
-- Break-glass ADMIN_EMAILS remains in app code forever.

CREATE TABLE IF NOT EXISTS admin_permissions (
  key         text PRIMARY KEY,
  module      text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  risk_level  text NOT NULL DEFAULT 'medium'
                CHECK (risk_level IN ('low','medium','high','critical')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  name_th     text NOT NULL,
  name_en     text,
  description text NOT NULL DEFAULT '',
  is_system   boolean NOT NULL DEFAULT true,
  is_super    boolean NOT NULL DEFAULT false,
  sort        int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_role_permissions (
  role_id     uuid NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  perm_key    text NOT NULL REFERENCES admin_permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_id, perm_key)
);

CREATE TABLE IF NOT EXISTS admin_user_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     uuid NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  granted_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  revoked_at  timestamptz,
  revoked_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  note        text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_user_roles_active
  ON admin_user_roles(user_id, role_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_admin_user_roles_user
  ON admin_user_roles(user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_invitations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            varchar(320) NOT NULL,
  role_id          uuid NOT NULL REFERENCES admin_roles(id),
  token_hash       text NOT NULL UNIQUE,
  invited_by       uuid NOT NULL REFERENCES users(id),
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at       timestamptz NOT NULL,
  accepted_at      timestamptz,
  accepted_user_id uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_admin_invitations_email
  ON admin_invitations(lower(email), status);

CREATE TABLE IF NOT EXISTS admin_action_policies (
  perm_key       text PRIMARY KEY REFERENCES admin_permissions(key) ON DELETE CASCADE,
  max_abs_delta  int,
  daily_cap      int,
  require_note   boolean NOT NULL DEFAULT true,
  dual_control   boolean NOT NULL DEFAULT false,
  meta           jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Support notes (minimal P0/P1 bridge for User 360)
CREATE TABLE IF NOT EXISTS user_admin_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       text NOT NULL,
  pinned     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_user_admin_notes_user
  ON user_admin_notes(user_id, created_at DESC);

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS actor_email text,
  ADD COLUMN IF NOT EXISTS actor_role  text,
  ADD COLUMN IF NOT EXISTS request_id  text,
  ADD COLUMN IF NOT EXISTS outcome     text DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS reason      text;

CREATE INDEX IF NOT EXISTS ix_audit_logs_action_created
  ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_logs_target
  ON audit_logs(target_type, target_id, created_at DESC);

COMMENT ON TABLE admin_roles IS 'Platform backoffice roles (not product org_members).';
COMMENT ON TABLE admin_user_roles IS 'Active platform admin assignments; revoke via revoked_at.';

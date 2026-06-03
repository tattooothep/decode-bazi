-- Backfill existing production data into the research console.
-- Idempotent: safe to run repeatedly.

INSERT INTO research_participants (user_id, org_id, status, cohort, consent_at, labels, notes)
SELECT
  id,
  current_org_id,
  'active',
  'prelaunch-research-20260603',
  created_at,
  CASE
    WHEN email LIKE 'phone.%@hourkey.local' THEN ARRAY['phone-login']::text[]
    WHEN email LIKE '%@test.local'
      OR email LIKE '%@decode.local'
      OR email LIKE 'dummy_%'
      OR email LIKE 'e2e_%'
      THEN ARRAY['test-like']::text[]
    ELSE ARRAY['email-login']::text[]
  END,
  'Backfilled from existing users on 2026-06-03'
FROM users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO research_events (org_id, user_id, event_name, page_path, payload, created_at)
SELECT
  current_org_id,
  id,
  'account_created',
  '/signup',
  jsonb_build_object(
    'source', 'users_backfill',
    'email', email,
    'name', name,
    'phone_present', phone IS NOT NULL
  ),
  created_at
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM research_events e
  WHERE e.event_name='account_created' AND e.user_id=u.id
);

INSERT INTO research_events (org_id, user_id, profile_id, event_name, page_path, payload, created_at)
SELECT
  p.org_id,
  p.created_by_user_id,
  p.id,
  'profile_created',
  '/input',
  jsonb_build_object(
    'source', 'profiles_backfill',
    'profile_name', p.name,
    'relationship_type', p.relationship_type,
    'network_group', p.network_group
  ),
  p.created_at
FROM profiles p
WHERE p.is_archived=false
  AND NOT EXISTS (
  SELECT 1 FROM research_events e
  WHERE e.event_name='profile_created' AND e.profile_id=p.id
);

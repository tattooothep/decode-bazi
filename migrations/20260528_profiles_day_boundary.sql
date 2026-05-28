-- Persist Zi-hour day-boundary convention per profile.
-- 23:00 = classical early Zi (default), 00:00 = late Zi / Voytek-style.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS day_boundary text NOT NULL DEFAULT '23:00';

ALTER TABLE profiles
  ADD CONSTRAINT profiles_day_boundary_check
  CHECK (day_boundary IN ('23:00', '00:00'))
  NOT VALID;

ALTER TABLE profiles
  VALIDATE CONSTRAINT profiles_day_boundary_check;

COMMENT ON COLUMN profiles.day_boundary IS
  'BaZi day-boundary convention used when computing day pillar: 23:00 classical early Zi, 00:00 late Zi/Voytek.';

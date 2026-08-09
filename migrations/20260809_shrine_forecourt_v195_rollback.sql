-- Refuse rollback once V195 has accepted or reserved any user activity.
DO $$
DECLARE used_rows bigint;
BEGIN
  SELECT
    (SELECT count(*) FROM shrine_forecourt_daily_cycles)
    + (SELECT count(*) FROM shrine_forecourt_throw_authorizations)
    + (SELECT count(*) FROM shrine_forecourt_throw_commits)
    + (SELECT count(*) FROM shrine_forecourt_recovery_awards)
    + (SELECT count(*) FROM shrine_forecourt_blessings)
    INTO used_rows;
  IF used_rows > 0 THEN
    RAISE EXCEPTION 'shrine_forecourt_v195_rollback_blocked:% durable rows', used_rows;
  END IF;
END $$;

DROP TABLE IF EXISTS shrine_forecourt_blessings;
DROP TABLE IF EXISTS shrine_forecourt_recovery_awards;
DROP TABLE IF EXISTS shrine_forecourt_throw_commits;
DROP TABLE IF EXISTS shrine_forecourt_throw_authorizations;
DROP TABLE IF EXISTS shrine_forecourt_daily_cycles;
DROP INDEX IF EXISTS uq_shrine_hourkey_results_owner_id_ritual;

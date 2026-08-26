BEGIN;

-- Repair any earlier rollout that exposed table-wide deletion to the shared
-- application role. Account deletion can still cascade from users; ordinary
-- runtime SQL cannot erase occurrence attestations directly.
REVOKE DELETE ON TABLE mobile_ziwei_hourly_occurrences FROM PUBLIC,hourkey_app;
REVOKE DELETE ON TABLE mobile_ziwei_hourly_installations FROM PUBLIC,hourkey_app;

-- A physical installation may move between authenticated accounts. Keep each
-- old disabled owner row so its occurrence FK remains intact, while allowing
-- exactly one account to schedule that installation at a time.
DROP INDEX IF EXISTS public.ux_mobile_ziwei_hourly_active_installation;
CREATE UNIQUE INDEX ux_mobile_ziwei_hourly_active_installation
  ON public.mobile_ziwei_hourly_installations(installation_id) WHERE enabled=true;

CREATE OR REPLACE FUNCTION public.purge_mobile_ziwei_hourly_occurrences(
  p_retention_days integer,
  p_batch_size integer
)
RETURNS TABLE(deleted_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_retention_days IS NULL OR p_retention_days<1 OR p_retention_days>3650
    OR p_batch_size IS NULL OR p_batch_size<1 OR p_batch_size>5000 THEN
    RAISE EXCEPTION 'mobile_ziwei_hourly_occurrence_retention_arguments_invalid'
      USING ERRCODE='22023';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT o.id
      FROM public.mobile_ziwei_hourly_occurrences o
     WHERE o.state IN ('claimed','skipped') AND o.push_log_id IS NULL
       AND o.created_at<statement_timestamp()-(p_retention_days*interval '1 day')
       AND o.window_valid_until<=statement_timestamp()
       AND o.send_deadline<=statement_timestamp()
     ORDER BY o.created_at,o.id
     LIMIT p_batch_size
     FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.mobile_ziwei_hourly_occurrences o
   USING candidates c
   WHERE o.id=c.id AND o.state IN ('claimed','skipped') AND o.push_log_id IS NULL
     AND o.created_at<statement_timestamp()-(p_retention_days*interval '1 day')
     AND o.window_valid_until<=statement_timestamp()
     AND o.send_deadline<=statement_timestamp()
  RETURNING o.id;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_mobile_ziwei_hourly_occurrences(integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_mobile_ziwei_hourly_occurrences(integer,integer) TO hourkey_app;

COMMIT;

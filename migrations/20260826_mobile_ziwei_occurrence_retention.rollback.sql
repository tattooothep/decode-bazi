BEGIN;

REVOKE EXECUTE ON FUNCTION public.purge_mobile_ziwei_hourly_occurrences(integer,integer) FROM hourkey_app;
DROP FUNCTION IF EXISTS public.purge_mobile_ziwei_hourly_occurrences(integer,integer);
REVOKE DELETE ON TABLE mobile_ziwei_hourly_occurrences FROM PUBLIC,hourkey_app;
REVOKE DELETE ON TABLE mobile_ziwei_hourly_installations FROM PUBLIC,hourkey_app;

COMMIT;

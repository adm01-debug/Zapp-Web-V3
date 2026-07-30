-- =============================================================================
-- Validation assertions (run after 20260702180000). Raises an exception if any
-- check fails so the migration pipeline surfaces regressions immediately.
-- =============================================================================
DO $$
DECLARE cnt int;
BEGIN
  -- Assert 0 SD functions anon-executable in app schemas
  SELECT count(*) INTO cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('zapp','public') AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF cnt > 0 THEN RAISE EXCEPTION 'ASSERT FAIL: % SD fns still anon-executable', cnt; END IF;

  -- Assert authenticated CAN execute has_role
  IF NOT has_function_privilege('authenticated','public.has_role(uuid,public.app_role)','EXECUTE') THEN
    RAISE EXCEPTION 'ASSERT FAIL: authenticated cannot execute has_role';
  END IF;

  -- Assert 0 run-as-owner views anon-readable in public
  SELECT count(*) INTO cnt FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='v'
    AND has_table_privilege('anon','public.'||quote_ident(c.relname),'SELECT')
    AND NOT COALESCE((SELECT lower(option_value)='true' FROM pg_options_to_table(c.reloptions)
                      WHERE option_name='security_invoker'),false);
  IF cnt > 0 THEN RAISE EXCEPTION 'ASSERT FAIL: % run-as-owner views still anon-readable', cnt; END IF;

  -- Assert 0 default_priv reconcedering anon in public
  SELECT count(*) INTO cnt FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
  WHERE n.nspname='public' AND array_to_string(d.defaclacl,',') LIKE '%anon=%';
  IF cnt > 0 THEN RAISE EXCEPTION 'ASSERT FAIL: % default_priv still grant anon in public', cnt; END IF;

  RAISE NOTICE 'All SD-fn anon-execute assertions PASSED';
END $$;

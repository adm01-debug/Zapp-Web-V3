-- Functions guarded: may not exist in CI if earlier migrations failed
DO $c3_guards$ BEGIN
  BEGIN
    ALTER FUNCTION public.fn_add_business_minutes(text, timestamp with time zone, integer) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_add_business_minutes(text,tstz,int) SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.fn_add_business_minutes(timestamp with time zone, integer, text) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_add_business_minutes(tstz,int,text) SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.fn_test_concurrency_accept(uuid, integer) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_test_concurrency_accept SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.handle_updated_at() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP handle_updated_at SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.is_admin_or_supervisor() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP is_admin_or_supervisor() SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.log_storage_upload_error() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP log_storage_upload_error SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.trg_fn_set_transfer_sla() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP trg_fn_set_transfer_sla SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.trg_transfer_auto_sla() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP trg_transfer_auto_sla SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.trg_transfer_notify() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP trg_transfer_notify SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.update_media_cache_access() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP update_media_cache_access SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP update_updated_at_column SET search_path: %', SQLERRM;
  END;
END $c3_guards$;

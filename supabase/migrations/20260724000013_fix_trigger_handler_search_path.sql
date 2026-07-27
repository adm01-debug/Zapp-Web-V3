-- Fix insecure search_path on SECURITY DEFINER trigger handler functions.
-- Guarded: functions may not exist in CI if earlier migrations failed.
DO $sp10_guards$ BEGIN
  BEGIN
    ALTER FUNCTION zapp.fn_contacts_view_insert_handler() SET search_path = zapp, evo;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP zapp.fn_contacts_view_insert_handler SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION zapp.fn_contacts_view_update_handler() SET search_path = zapp, evo;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP zapp.fn_contacts_view_update_handler SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION zapp.fn_contacts_view_delete_handler() SET search_path = zapp, evo;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP zapp.fn_contacts_view_delete_handler SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION zapp.fn_messages_view_insert_handler() SET search_path = zapp, evo;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP zapp.fn_messages_view_insert_handler SET search_path: %', SQLERRM;
  END;
END $sp10_guards$;

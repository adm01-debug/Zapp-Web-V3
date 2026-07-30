
DO $$
DECLARE
  fn text;
  fn_list text[] := ARRAY[
    'sanitize_reset_request()',
    'ensure_single_default_ai_provider()',
    'encrypt_gmail_token(text)',
    'rpc_migrate_whatsapp_integration()'
  ];
BEGIN
  FOREACH fn IN ARRAY fn_list LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'skip missing function: %', fn;
    END;
  END LOOP;
END $$;

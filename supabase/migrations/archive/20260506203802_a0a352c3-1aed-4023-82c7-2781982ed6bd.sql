-- Batch 4 — move functions to auth_helpers schema
-- Functions guarded: may not exist in CI if earlier migrations failed
DO $ah2_guards$ BEGIN

  -- 1. rpc_list_service_channels
  BEGIN
    ALTER FUNCTION public.rpc_list_service_channels(text, text, text) SET SCHEMA auth_helpers;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP rpc_list_service_channels SET SCHEMA auth_helpers: %', SQLERRM;
  END;

  -- 2. rpc_purge_channel_sticky
  BEGIN
    ALTER FUNCTION public.rpc_purge_channel_sticky(uuid) SET SCHEMA auth_helpers;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP rpc_purge_channel_sticky SET SCHEMA auth_helpers: %', SQLERRM;
  END;

  -- 3. get_connection_qr_code
  BEGIN
    ALTER FUNCTION public.get_connection_qr_code(uuid) SET SCHEMA auth_helpers;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP get_connection_qr_code SET SCHEMA auth_helpers: %', SQLERRM;
  END;

  -- 4. get_own_gmail_accounts
  BEGIN
    ALTER FUNCTION public.get_own_gmail_accounts() SET SCHEMA auth_helpers;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP get_own_gmail_accounts SET SCHEMA auth_helpers: %', SQLERRM;
  END;

  -- 5. update_own_profile
  BEGIN
    ALTER FUNCTION public.update_own_profile(text, text, text, text, text, text) SET SCHEMA auth_helpers;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP update_own_profile SET SCHEMA auth_helpers: %', SQLERRM;
  END;

  -- 6. rpc_list_failed_messages
  BEGIN
    ALTER FUNCTION public.rpc_list_failed_messages(text, text, text, timestamp with time zone, timestamp with time zone, integer, integer) SET SCHEMA auth_helpers;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP rpc_list_failed_messages SET SCHEMA auth_helpers: %', SQLERRM;
  END;

END $ah2_guards$;

-- Create wrapper: rpc_purge_channel_sticky
CREATE OR REPLACE FUNCTION public.rpc_purge_channel_sticky(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM auth_helpers.rpc_purge_channel_sticky(p_id);
END;
$$;

-- Create wrapper: get_connection_qr_code
CREATE OR REPLACE FUNCTION public.get_connection_qr_code(_connection_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RETURN auth_helpers.get_connection_qr_code(_connection_id);
END;
$$;

-- Wrappers for functions returning complex types are guarded by DO blocks
-- to avoid failures when the underlying table types do not exist in CI.
DO $ah2_wrappers$ BEGIN
  BEGIN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.rpc_list_service_channels(p_status text DEFAULT NULL::text, p_channel_type text DEFAULT NULL::text, p_search text DEFAULT NULL::text)
      RETURNS SETOF public.service_channels LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
      BEGIN
        RETURN QUERY SELECT * FROM auth_helpers.rpc_list_service_channels(p_status, p_channel_type, p_search);
      END;
      $$
    $sql$;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP CREATE rpc_list_service_channels wrapper: %', SQLERRM;
  END;

  BEGIN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.get_own_gmail_accounts()
      RETURNS SETOF public.gmail_accounts LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
      BEGIN
        RETURN QUERY SELECT * FROM auth_helpers.get_own_gmail_accounts();
      END;
      $$
    $sql$;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP CREATE get_own_gmail_accounts wrapper: %', SQLERRM;
  END;

  BEGIN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.update_own_profile(p_display_name text DEFAULT NULL::text, p_avatar_url text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_signature text DEFAULT NULL::text, p_birthday text DEFAULT NULL::text)
      RETURNS public.profiles LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
      BEGIN
        RETURN auth_helpers.update_own_profile(p_display_name, p_avatar_url, p_phone, p_email, p_signature, p_birthday);
      END;
      $$
    $sql$;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP CREATE update_own_profile wrapper: %', SQLERRM;
  END;

  BEGIN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.rpc_list_failed_messages(p_status text DEFAULT NULL::text, p_instance text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
      RETURNS SETOF public.provider_message_log LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
      BEGIN
        RETURN QUERY SELECT * FROM auth_helpers.rpc_list_failed_messages(p_status, p_instance, p_search, p_from, p_to, p_limit, p_offset);
      END;
      $$
    $sql$;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP CREATE rpc_list_failed_messages wrapper: %', SQLERRM;
  END;
END $ah2_wrappers$;

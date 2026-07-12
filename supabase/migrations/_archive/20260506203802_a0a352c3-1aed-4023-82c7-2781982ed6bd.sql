-- Batch 4
-- Note: I'm skipping explicit arguments in ALTER to save space if they are simple, but for some I'll be precise.

-- 1. rpc_list_service_channels
ALTER FUNCTION public.rpc_list_service_channels(text, text, text) SET SCHEMA auth_helpers;
CREATE OR REPLACE FUNCTION public.rpc_list_service_channels(p_status text DEFAULT NULL::text, p_channel_type text DEFAULT NULL::text, p_search text DEFAULT NULL::text)
RETURNS SETOF public.service_channels LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT * FROM auth_helpers.rpc_list_service_channels(p_status, p_channel_type, p_search);
END;
$$;

-- 2. rpc_purge_channel_sticky
ALTER FUNCTION public.rpc_purge_channel_sticky(uuid) SET SCHEMA auth_helpers;
CREATE OR REPLACE FUNCTION public.rpc_purge_channel_sticky(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM auth_helpers.rpc_purge_channel_sticky(p_id);
END;
$$;

-- 3. get_connection_qr_code
ALTER FUNCTION public.get_connection_qr_code(uuid) SET SCHEMA auth_helpers;
CREATE OR REPLACE FUNCTION public.get_connection_qr_code(_connection_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RETURN auth_helpers.get_connection_qr_code(_connection_id);
END;
$$;

-- 4. get_own_gmail_accounts
ALTER FUNCTION public.get_own_gmail_accounts() SET SCHEMA auth_helpers;
CREATE OR REPLACE FUNCTION public.get_own_gmail_accounts()
RETURNS SETOF public.gmail_accounts LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT * FROM auth_helpers.get_own_gmail_accounts();
END;
$$;

-- 5. update_own_profile
ALTER FUNCTION public.update_own_profile(text, text, text, text, text, text) SET SCHEMA auth_helpers;
CREATE OR REPLACE FUNCTION public.update_own_profile(p_display_name text DEFAULT NULL::text, p_avatar_url text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_signature text DEFAULT NULL::text, p_birthday text DEFAULT NULL::text)
RETURNS public.profiles LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RETURN auth_helpers.update_own_profile(p_display_name, p_avatar_url, p_phone, p_email, p_signature, p_birthday);
END;
$$;

-- 6. rpc_list_failed_messages
ALTER FUNCTION public.rpc_list_failed_messages(text, text, text, timestamp with time zone, timestamp with time zone, integer, integer) SET SCHEMA auth_helpers;
CREATE OR REPLACE FUNCTION public.rpc_list_failed_messages(p_status text DEFAULT NULL::text, p_instance text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS SETOF public.provider_message_log LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT * FROM auth_helpers.rpc_list_failed_messages(p_status, p_instance, p_search, p_from, p_to, p_limit, p_offset);
END;
$$;

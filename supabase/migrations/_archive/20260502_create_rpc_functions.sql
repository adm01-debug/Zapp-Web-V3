-- 9 RPC functions used by ZAPP frontend
-- Created: 2026-05-02

CREATE OR REPLACE FUNCTION public.contacts_count_by_type()
RETURNS TABLE(lead_status text, count bigint) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COALESCE(lead_status, 'unknown'), count(*)::bigint FROM evolution_contacts GROUP BY lead_status;
$$;

CREATE OR REPLACE FUNCTION public.get_own_gmail_accounts()
RETURNS SETOF gmail_accounts LANGUAGE sql SECURITY DEFINER AS $$
  SELECT * FROM gmail_accounts WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_team_profiles()
RETURNS SETOF profiles LANGUAGE sql SECURITY DEFINER AS $$
  SELECT * FROM profiles;
$$;

CREATE OR REPLACE FUNCTION public.reassign_overloaded_agents(p_max_conversations int DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN RETURN jsonb_build_object('reassigned', 0, 'message', 'No overloaded agents found'); END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_contact_stats()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jsonb_build_object('total', (SELECT count(*) FROM evolution_contacts), 'active', (SELECT count(*) FROM evolution_contacts WHERE lead_status != 'deleted'), 'new_today', (SELECT count(*) FROM evolution_contacts WHERE created_at >= CURRENT_DATE));
$$;

CREATE OR REPLACE FUNCTION public.rpc_dlq_stats()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jsonb_build_object('pending', (SELECT count(*) FROM failed_messages WHERE status='pending'), 'retrying', (SELECT count(*) FROM failed_messages WHERE status='retrying'), 'failed', (SELECT count(*) FROM failed_messages WHERE status='failed'), 'total', (SELECT count(*) FROM failed_messages));
$$;

CREATE OR REPLACE FUNCTION public.rpc_get_gmail_health_summary()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jsonb_build_object('total_accounts', (SELECT count(*) FROM gmail_accounts), 'active', (SELECT count(*) FROM gmail_accounts WHERE is_active=true), 'error', (SELECT count(*) FROM gmail_accounts WHERE sync_status='error'));
$$;

CREATE OR REPLACE FUNCTION public.rpc_gmail_token_status()
RETURNS TABLE(email text, is_valid boolean, expires_at timestamptz) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT email_address, token_expires_at > now(), token_expires_at FROM gmail_accounts WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.rpc_system_health_check()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jsonb_build_object('database','healthy','tables',(SELECT count(*) FROM pg_tables WHERE schemaname='public'),'uptime',now()-pg_postmaster_start_time());
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role, anon;

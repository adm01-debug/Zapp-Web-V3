
-- Tighten new helper from Phase 1
REVOKE EXECUTE ON FUNCTION public.is_queue_member_of_contact(uuid, uuid) FROM PUBLIC;

-- ============================================================
-- Phase 2: Revoke EXECUTE on trigger-only / cron-only / service-only fns
-- ============================================================
DO $$
DECLARE
  fn text;
  fn_list text[] := ARRAY[
    -- Auth / signup triggers
    'handle_new_user()',
    'handle_new_user_role()',
    'handle_new_user_settings()',
    'init_agent_stats()',
    'update_agent_level()',
    -- Audit / role protection triggers
    'log_assignment_change()',
    'audit_role_changes()',
    'on_role_change()',
    'prevent_profile_privilege_escalation()',
    'prevent_role_escalation()',
    'mask_channel_credentials()',
    'rate_limit_reset_requests()',
    'ensure_single_default_filter()',
    'notify_sicoob_on_reply()',
    'clear_qr_on_connect()',
    'normalize_contact_phone()',
    'auto_assign_contact()',
    'auto_assign_to_queue_agent()',
    'update_device_last_seen()',
    'update_global_settings_updated_at()',
    'handle_updated_at()',
    'generate_transfer_ticket()',
    -- Cron / maintenance
    'cleanup_expired_challenges()',
    'purge_old_query_telemetry(integer)',
    'reassign_absent_agents(integer)',
    'reassign_overloaded_agents()',
    -- Server-only auth/security
    'record_failed_login(text, text, text)',
    'clear_login_attempts(text)',
    'pause_instance(text, text, integer, integer)',
    'unpause_instance(text)',
    'decrypt_gmail_token(bytea)',
    'log_security_event(text, text, text, text, jsonb)',
    -- Admin-only inspection (already gated internally, but block direct calls)
    'get_channel_credentials(uuid)',
    'get_connection_qr_code(uuid)'
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

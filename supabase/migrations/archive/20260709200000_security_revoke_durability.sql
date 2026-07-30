-- ============================================================
-- MIGRATION: security_revoke_durability
-- Criado: 2026-07-09 (sessão de auditoria rodada 4)
-- Bug #86: DROP+CREATE de função reseta grants para PUBLIC
-- Fix: REVOKE idempotente de todos os overloads restritos
-- Todos os REVOKE são no-op se o grant não existir (seguro re-rodar)
-- ============================================================

-- -------------------------------------------------------
-- GRUPO 1: Funções de monitoramento interno
-- -------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_system_health_score() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_system_health_score() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_score_security_acl() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_score_security_acl() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_check_email_rpc_acl() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_check_email_rpc_acl() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_security_acl_master_check() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_security_acl_master_check() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_check_email_views_acl() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_check_email_views_acl() TO authenticated;

-- -------------------------------------------------------
-- GRUPO 2: search_contacts — expunha TODOS os contatos
-- -------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.search_contacts(
  search_term text, contact_type_filter text, company_filter text,
  job_title_filter text, tag_filter text,
  date_from timestamp with time zone,
  sort_field text, sort_direction text,
  page_size integer, page_offset integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_contacts(
  search_term text, contact_type_filter text, company_filter text,
  job_title_filter text, tag_filter text,
  date_from timestamp with time zone,
  sort_field text, sort_direction text,
  page_size integer, page_offset integer
) TO authenticated;

-- -------------------------------------------------------
-- GRUPO 3: fn_accept_transfer (2 overloads)
-- -------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_accept_transfer(p_transfer_id uuid, p_agent_id uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accept_transfer(p_transfer_id uuid, p_agent_id uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_accept_transfer(p_transfer_id uuid, p_operator text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accept_transfer(p_transfer_id uuid, p_operator text) TO authenticated;

-- -------------------------------------------------------
-- GRUPO 4: fn_complete_transfer (2 overloads)
-- -------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_complete_transfer(p_transfer_id uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_complete_transfer(p_transfer_id uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_complete_transfer(p_transfer_id uuid, p_notes text, p_type text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_complete_transfer(p_transfer_id uuid, p_notes text, p_type text) TO authenticated;

-- -------------------------------------------------------
-- GRUPO 5: fn_create_transfer (2 overloads)
-- -------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_create_transfer(
  p_conversation_id uuid, p_from_agent_id uuid, p_to_agent_id uuid,
  p_to_queue_id uuid, p_transfer_type text, p_priority text, p_context_summary text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_create_transfer(
  p_conversation_id uuid, p_from_agent_id uuid, p_to_agent_id uuid,
  p_to_queue_id uuid, p_transfer_type text, p_priority text, p_context_summary text
) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_create_transfer(
  p_source_instance text, p_target_instance text, p_remote_jid text,
  p_reason text, p_category text, p_priority integer, p_transfer_type text,
  p_source_operator text, p_context_summary text, p_tags text[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_create_transfer(
  p_source_instance text, p_target_instance text, p_remote_jid text,
  p_reason text, p_category text, p_priority integer, p_transfer_type text,
  p_source_operator text, p_context_summary text, p_tags text[]
) TO authenticated;

-- -------------------------------------------------------
-- GRUPO 6: fn_return_transfer
-- -------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_return_transfer(p_transfer_id uuid, p_reason text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_return_transfer(p_transfer_id uuid, p_reason text) TO authenticated;

-- -------------------------------------------------------
-- GRUPO 7: fn_transfer_comment (2 overloads)
-- -------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_transfer_comment(p_transfer_id uuid, p_agent_id uuid, p_content text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_transfer_comment(p_transfer_id uuid, p_agent_id uuid, p_content text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_transfer_comment(p_transfer_id uuid, p_author text, p_instance text, p_content text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_transfer_comment(p_transfer_id uuid, p_author text, p_instance text, p_content text) TO authenticated;

-- -------------------------------------------------------
-- GRUPO 8: manage_department_member (4 overloads)
-- -------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text, _admin_user_id uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text, _admin_user_id uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text, _admin_user_id uuid, _target_profile_id uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.manage_department_member(p_profile_id uuid, p_department_id uuid, p_action text, _admin_user_id uuid, _target_profile_id uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.manage_department_member(_admin_user_id uuid, _target_profile_id uuid, _department_id uuid, _action text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.manage_department_member(_admin_user_id uuid, _target_profile_id uuid, _department_id uuid, _action text) TO authenticated;

-- -------------------------------------------------------
-- GRUPO 9: rpc_dlq_abandon (3 overloads)
-- -------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rpc_dlq_abandon(p_item_id uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_dlq_abandon(p_item_id uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_dlq_abandon(p_id uuid, p_reason text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_dlq_abandon(p_id uuid, p_reason text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_dlq_abandon(p_item_id uuid, p_id uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_dlq_abandon(p_item_id uuid, p_id uuid) TO authenticated;

-- -------------------------------------------------------
-- GRUPO 10: rpc_dlq_bulk_abandon (2 overloads)
-- -------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rpc_dlq_bulk_abandon(p_ids uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_dlq_bulk_abandon(p_ids uuid[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_dlq_bulk_abandon(p_ids uuid[], p_reason text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_dlq_bulk_abandon(p_ids uuid[], p_reason text) TO authenticated;

-- -------------------------------------------------------
-- GRUPO 11: rpc_dlq_retry_now (2 overloads)
-- -------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rpc_dlq_retry_now(p_item_id uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_dlq_retry_now(p_item_id uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_dlq_retry_now(p_item_id uuid, p_id uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_dlq_retry_now(p_item_id uuid, p_id uuid) TO authenticated;

-- -------------------------------------------------------
-- GRUPO 12: rpc_dlq_list_audit (2 overloads)
-- -------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rpc_dlq_list_audit(p_limit integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_dlq_list_audit(p_limit integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_dlq_list_audit(p_limit integer, p_offset integer, p_action text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_dlq_list_audit(p_limit integer, p_offset integer, p_action text) TO authenticated;

-- -------------------------------------------------------
-- GRUPO 13: rpc_dlq_log_item_action (3 overloads)
-- -------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rpc_dlq_log_item_action(p_item_id uuid, p_action text, p_reason text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_dlq_log_item_action(p_item_id uuid, p_action text, p_reason text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_dlq_log_item_action(p_action text, p_ids uuid[], p_reason text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_dlq_log_item_action(p_action text, p_ids uuid[], p_reason text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_dlq_log_item_action(p_item_id uuid, p_action text, p_reason text, p_ids uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_dlq_log_item_action(p_item_id uuid, p_action text, p_reason text, p_ids uuid[]) TO authenticated;

-- -------------------------------------------------------
-- GRUPO 14: rpc_list_dispatch_error_logs (2 overloads)
-- -------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rpc_list_dispatch_error_logs(p_limit integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_list_dispatch_error_logs(p_limit integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_list_dispatch_error_logs(
  p_from timestamp with time zone, p_to timestamp with time zone,
  p_instance text, p_agent text, p_error_code text,
  p_search text, p_limit integer, p_offset integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_list_dispatch_error_logs(
  p_from timestamp with time zone, p_to timestamp with time zone,
  p_instance text, p_agent text, p_error_code text,
  p_search text, p_limit integer, p_offset integer
) TO authenticated;

-- -------------------------------------------------------
-- GRUPO 15: rpc_list_failed_messages (3 overloads)
-- -------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rpc_list_failed_messages(p_limit integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_list_failed_messages(p_limit integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_list_failed_messages(
  p_status text, p_instance text, p_search text,
  p_from timestamp with time zone, p_to timestamp with time zone,
  p_limit integer, p_offset integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_list_failed_messages(
  p_status text, p_instance text, p_search text,
  p_from timestamp with time zone, p_to timestamp with time zone,
  p_limit integer, p_offset integer
) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_list_failed_messages(
  p_status text[], p_instance text, p_search text,
  p_from timestamp with time zone, p_to timestamp with time zone,
  p_limit integer, p_offset integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_list_failed_messages(
  p_status text[], p_instance text, p_search text,
  p_from timestamp with time zone, p_to timestamp with time zone,
  p_limit integer, p_offset integer
) TO authenticated;

-- -------------------------------------------------------
-- GRUPO 16: rpc_upsert_contact (2 overloads)
-- -------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rpc_upsert_contact(
  p_remote_jid text, p_instance text, p_push_name text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_contact(
  p_remote_jid text, p_instance text, p_push_name text
) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_upsert_contact(
  p_remote_jid text, p_instance text, p_push_name text, p_full_name text,
  p_phone_number text, p_email text, p_company text, p_role_title text,
  p_lead_status text, p_lead_source text, p_lead_score integer,
  p_assigned_to text, p_tags text[], p_notes text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_contact(
  p_remote_jid text, p_instance text, p_push_name text, p_full_name text,
  p_phone_number text, p_email text, p_company text, p_role_title text,
  p_lead_status text, p_lead_source text, p_lead_score integer,
  p_assigned_to text, p_tags text[], p_notes text
) TO authenticated;

-- -------------------------------------------------------
-- GRUPO 17: rpc_instance_auth_event_summary (2 overloads)
-- -------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rpc_instance_auth_event_summary(p_instance text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_instance_auth_event_summary(p_instance text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_instance_auth_event_summary(p_hours integer, p_instance text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_instance_auth_event_summary(p_hours integer, p_instance text) TO authenticated;

-- -------------------------------------------------------
-- GRUPO 18: rpc_instance_auth_event_trend (2 overloads)
-- -------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rpc_instance_auth_event_trend(p_instance text, p_hours integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_instance_auth_event_trend(p_instance text, p_hours integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_instance_auth_event_trend(p_hours integer, p_instance text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_instance_auth_event_trend(p_hours integer, p_instance text) TO authenticated;

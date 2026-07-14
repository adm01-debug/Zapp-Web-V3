# Aceite formal — Linter 0029 (SECURITY DEFINER executável por authenticated)

**Data:** 2026-07-11
**Escopo:** 64 funções `public.*` marcadas pelo linter da Supabase com o código
`0029_authenticated_security_definer_function_executable`.
**Status:** ✅ **Aceite documentado — não mitigar em massa.**

## Racional

O linter 0029 sinaliza qualquer `SECURITY DEFINER` acessível a `authenticated`.
Todas as 64 funções listadas abaixo são **RPCs do produto**, chamadas pelo
frontend autenticado exatamente porque precisam contornar RLS de forma
controlada (checagem de papéis, escrita transacional em transferências, ações
de DLQ, busca de contatos com predicados de tenant, etc.). A segurança já é
enforçada **dentro** de cada função via `has_role(auth.uid(), …)`,
`auth.uid() = …`, allowlists explícitas e `SET search_path` fixo — padrão
descrito em [`docs/RLS_SECURITY_DEFINER_HARDENING.md`](RLS_SECURITY_DEFINER_HARDENING.md).

Revogar `EXECUTE` em massa quebraria: login (`is_account_locked`,
`get_own_lockout_status`, `validate_reset_token`), permissões
(`has_role`, `check_user_permission`, `user_has_permission`), inbox
(`is_contact_visible_to_user`, `is_within_business_hours`,
`skill_based_assign`), transferências (`fn_*_transfer`), DLQ
(`rpc_dlq_*`), busca (`search_contacts`, `search_knowledge_base`) e
gestão de perfil (`update_own_profile`, `get_own_gmail_accounts`).

## Funções aceitas (64)

Autorização interna via `has_role` / `auth.uid()`:

- `check_user_permission`, `has_role`, `is_admin_or_supervisor`,
  `user_has_permission`, `get_profile_id_for_user`,
  `get_profile_role_for_check`, `get_visible_agent_ids`
- `is_account_locked`, `is_country_allowed`, `is_country_blocked`,
  `is_ip_blocked`, `is_ip_whitelisted`, `get_own_lockout_status`,
  `validate_reset_token`, `get_own_reset_requests`, `get_reset_requests_safe`
- `is_contact_visible_to_user`, `is_queue_member_of_contact`,
  `is_team_conversation_member`, `is_within_business_hours`,
  `skill_based_assign`, `contacts_count_by_type`,
  `rpc_upsert_contact`, `search_contacts`, `search_knowledge_base`
- `fn_accept_transfer` (x2), `fn_complete_transfer` (x2),
  `fn_create_transfer` (x2), `fn_return_transfer`,
  `fn_transfer_comment` (x2)
- `fn_increment_meme_use`, `fn_list_audio_meme_categories`,
  `fn_list_audio_memes_for_user`, `fn_toggle_user_meme_favorite`
- `rpc_dlq_abandon` (x2), `rpc_dlq_bulk_abandon`, `rpc_dlq_list_audit` (x2),
  `rpc_dlq_log_item_action` (x2), `rpc_dlq_retry_now` (x2),
  `rpc_list_dispatch_error_logs`, `rpc_list_failed_messages` (x2),
  `rpc_instance_auth_event_summary`, `rpc_instance_auth_event_trend`
- `log_audit_event` (x2), `log_rls_denied`
- `get_channel_credentials_safe`, `get_connection_instance`,
  `get_own_gmail_accounts`, `get_team_profiles`,
  `manage_department_member` (x3), `update_own_profile`

## Reavaliação

Executar `supabase--linter` a cada nova migration. Se aparecer uma **nova**
função SECURITY DEFINER (fora desta lista), auditar antes de dar `GRANT
EXECUTE ... TO authenticated` — o padrão é `SECURITY INVOKER` sempre que
possível.

## Referências
- [`docs/RLS_SECURITY_DEFINER_HARDENING.md`](RLS_SECURITY_DEFINER_HARDENING.md)
- [`db/security/2026-06-30_anon_rpc_hardening.sql`](../../db/security/2026-06-30_anon_rpc_hardening.sql)
  — hardening já removeu `anon` das mesmas funções (só `authenticated` +
  `service_role` retêm `EXECUTE`).

# Simulação Auth/RLS — 2026-07-12

- Cenários: 70
- Aprovados: 64
- Violações: 6

## Gaps identificados

- **reset-rate-limit-5** (reset-rate-limit): rate-limit apenas em trigger; adicionar no edge approve-password-reset
- **has_role-cache-stale** (has-role-cache): invalidar cache de sessão ao mudar user_roles (trigger + realtime)
- **secdef-audit-rpc_dlq_retry_now** (secdef-audit): rpc_dlq_retry_now: adicionar has_role check + log_rls_denied
- **secdef-audit-rpc_dlq_abandon** (secdef-audit): rpc_dlq_abandon: adicionar has_role check + log_rls_denied
- **secdef-audit-rpc_dlq_bulk_abandon** (secdef-audit): rpc_dlq_bulk_abandon: adicionar has_role check + log_rls_denied
- **secdef-audit-rpc_dlq_log_item_action** (secdef-audit): rpc_dlq_log_item_action: adicionar has_role check + log_rls_denied

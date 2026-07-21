# Histórico do CLAUDE.md (arquivado)

> Conteúdo histórico movido do `CLAUDE.md` raiz para reduzir o contexto carregado
> em toda sessão do Claude Code. Mantido aqui apenas para consulta pontual.

---

## Bugs Conhecidos e Gaps — histórico (resolvidos)

| ID | Arquivo | Problema | Impacto |
|----|---------|----------|---------|
| ~~BUG-1~~ | `src/features/admin/hooks/useAdminManagement.ts` | CORRIGIDO: `safeFrom('queue_skills')` → `safeFrom('queue_skill_requirements')` | Resolvido |
| ~~BUG-2~~ | `src/features/inbox/components/chat/useAudioVoiceChange.ts` | CORRIGIDO: bucket `chat-media` → `audio-messages`; coluna `mediaUrl` → `media_url` (PostgREST snake_case) | Resolvido |
| ~~BUG-3~~ | `zapp.fn_messages_view_insert_handler` / `messageSender.ts` | CORRIGIDO: trigger INSTEAD OF INSERT não atribuía `NEW.id` antes de `RETURN NEW`; `data.id` retornava NULL; CORRIGIDO no trigger (DB) e via `crypto.randomUUID()` no cliente | Resolvido |
| ~~BUG-4~~ | `src/hooks/useCRMManagement.ts` | CORRIGIDO: `contact_notes` INSERT omitia FK não-nula `author_id`; adicionado `supabase.auth.getUser()` | Resolvido |
| ~~BUG-5~~ | `supabase/migrations/20260712001500_cursor_pagination_optimization.sql:145` | CORRIGIDO: GRANT em `rpc_list_dispatch_error_logs_cursor` tinha 7 params vs 8 na assinatura real; nenhum usuário autenticado tinha permissão; fix em `20260716_fix_dispatch_error_logs_grant.sql` | Resolvido |
| ~~BUG-6~~ | `src/features/admin/hooks/monitoring/useDispatchErrorLogs.ts` | CORRIGIDO: `p_cursor_id` hardcoded como `null`; paginação nunca avançava; adicionado cursor state management | Resolvido |
| ~~BUG-7~~ | `src/features/admin/hooks/monitoring/useFailedMessages.ts:142` | REVERTIDO: mudança anterior de `schema: 'zapp'` → `schema: 'public'` era regressão — `public.failed_messages` é VIEW, não está na publication `supabase_realtime`; subscription era no-op silencioso; mantido `schema: 'zapp'` (tabela física, publicada) | Resolvido |
| ~~GAP-2~~ | `src/hooks/useIntegrationManagement.ts:54,69` | STUB CRIADO: `rpc('initiate_gmail_oauth')`, `rpc('complete_gmail_oauth')` — stubs em `20260717000002_create_missing_rpcs_stubs.sql`; retornam erro descritivo em vez de 42883 | UI degrada com mensagem; OAuth real pendente |
| ~~GAP-3~~ | `src/hooks/useIntegrationManagement.ts:156` | STUB CRIADO: `rpc('sync_to_crm')` — stub em `20260717000002`; levanta RAISE EXCEPTION explícita (P0001) em vez de retornar void | Sync real pendente |
| ~~GAP-4~~ | `src/hooks/useMediaManagement.ts:93,128` | STUB CRIADO: `rpc('export_user_data')`, `rpc('import_user_data')` — stubs em `20260717000002`; export retorna dados de perfil (formatos != 'json' rejeitados com RAISE); import levanta RAISE EXCEPTION | Export/Import parcial; full data export deve ser Edge Function |
| ~~BUG-9~~ | `src/hooks/useMediaManagement.ts:164` | CORRIGIDO: `rpc('check_download_permission')` ausente → `hasPermission` ficava `false` permanentemente, bloqueando todos os downloads silenciosamente; fail-open restrito a SQLSTATE 42883 (função não existe) — outros erros mantêm permissão negada | Resolvido |
| ~~GAP-5~~ | `src/hooks/useCRMManagement.ts:146` | STUB CRIADO: `rpc('enrich_contact')` — stub em `20260717000002`; retorna dados básicos do contato com `enriched: false` | Integração com API de enriquecimento pendente |
| ~~GAP-6~~ | `src/hooks/useAnalyticsManagement.ts:168` | STUB CRIADO: `rpc('get_latest_analysis')` — stub em `20260717000002`; retorna média de `contact_intelligence.engagement_score` | Analytics completo pendente |
| ~~BUG-8~~ | `supabase/migrations/20260712001500_cursor_pagination_optimization.sql:8` | CORRIGIDO: `rpc_list_failed_messages_cursor` tinha RETURNS TABLE com 9 cols vs 15 esperadas por FailedMessageRow; `fm.message_id` inexistente causava erro de compilação; `next_retry_at` vs `next_attempt_at` (nome errado); cursor keyset ignorava ties na created_at. Fix: `20260716_fix_rpc_list_failed_messages_cursor_columns.sql` | Resolvido |
| ~~GAP-8~~ | `src/features/admin/hooks/monitoring/useDispatchErrorLogs.ts:61` | CORRIGIDO: `rpc_list_dispatch_error_logs_cursor` estava no schema `public` (PGRST202); tabela referenciada era `public.dispatch_error_logs` (VIEW); count era pós-cursor (decrementava por página); cursor sem ROW() ignorava ties. Fix: `20260717000003_fix_dispatch_dlq_cursor_rpcs_zapp_schema.sql` — movida para `zapp`, conta antes do cursor, ROW() keyset | Resolvido |
| ~~GAP-9~~ | `src/features/admin/hooks/monitoring/useDlqAuditLog.ts:51` | CORRIGIDO: `rpc_dlq_list_audit_cursor` estava no schema `public` (PGRST202); referências `public.audit_logs`, `public.profiles` → `zapp.audit_logs`, `zapp.profiles`; cursor sem ROW() ignorava ties. Fix: `20260717000003_fix_dispatch_dlq_cursor_rpcs_zapp_schema.sql` | Resolvido |
| ~~GAP-10~~ | `src/hooks/useQueueManagement.ts:203,415` | TABELA CRIADA: `zapp.queue_analytics` em `20260717000001_create_queue_analytics.sql`; FK para `queues`, RLS habilitado, índice em `(queue_id, timestamp DESC)` | Resolvido |
| ~~BUG-10~~ | `src/features/admin/hooks/monitoring/useFailedMessages.ts:60` | CORRIGIDO: `effectiveFrom` calculado a cada render com `Date.now()` e colocado em `queryKey` + `useEffect` deps → loop infinito de refetch + setState. Fix: `useMemo([from, hours])` para estabilizar o valor | Resolvido |
| ~~BUG-11~~ | `supabase/migrations/20260717000002_create_missing_rpcs_stubs.sql` | CORRIGIDO: stubs `initiate_gmail_oauth` / `complete_gmail_oauth` retornavam JSON `{success:false}` sem RAISE; chamador em `useIntegrationManagement.ts:72` faz `setIsAuthenticated(true)` incondicionalmente após a RPC não retornar erro → falso estado autenticado. Fix: ambos os stubs agora fazem RAISE EXCEPTION com ERRCODE P0001 | Resolvido |
| ~~BUG-12~~ | `zapp.rpc_dlq_bulk_retry_now` no DB | CORRIGIDO 2026-07-17: chamava `public.has_role()` e `public.log_rls_denied()` (não existem em public); escrevia em `public.audit_logs` (não existe). DROP+CREATE com `zapp.has_role` e `zapp.log_rls_denied` | Resolvido |
| ~~BUG-13~~ | `zapp.rpc_dlq_list_audit` no DB | CORRIGIDO 2026-07-17: JOIN errado `p.id = a.user_id` — `profiles.id` é UUID surrogado; o auth UID está em `profiles.user_id`. Resultado: `user_name` e `user_email` sempre NULL no painel. Corrigido para `p.user_id = a.user_id` | Resolvido |
| ~~BUG-14~~ | `zapp.rpc_dlq_log_item_action` no DB | CORRIGIDO 2026-07-17: 2 overloads inseguros sem role check gravando em `zapp.dlq_audit_log` (tabela errada — painel lê `zapp.audit_logs`). Drops aplicados; canonical (text,uuid[],text) corrigido para gravar em `zapp.audit_logs` com supervisor role | Resolvido |
| ~~BUG-15~~ | `zapp.rpc_dlq_log_reprocess_trigger` / `rpc_dlq_log_reprocess_result` no DB | CORRIGIDO 2026-07-17: `SET search_path TO 'public','evo','zapp','monitoring'` inseguro; supervisor bloqueado. Corrigido para `SET search_path = zapp` + `zapp.has_role(..., 'supervisor')` | Resolvido |
| ~~BUG-16~~ | `zapp.search_contacts_cursor` no DB | CORRIGIDO 2026-07-17: (1) cursor direction usava `sort_direction = 'asc'` case-sensitive — passar 'ASC' quebrava paginação pág 2+; (2) `sort_direction` injetável via ORDER BY string concat. Corrigido: `v_sort_dir := UPPER(...); IF v_sort_dir NOT IN ('ASC','DESC')` | Resolvido |

---

## Sessão 2026-07-17 (tarde) — Meta 10/10

### Melhorias executadas

| Item | Ação | Status |
|---|---|---|
| Branches lovable-sync | Deletados (−106K/−104K linhas vs main se mergeados) | ✅ |
| `public._wal_slot_guard_events` | COMMENT documentando deny-all intencional | ✅ |
| `bpm_check_breached_slas` | Cron criado (job 198, */5 min) | ✅ |
| TypeScript 0 errors | `tsc --noEmit --skipLibCheck`: 0 erros | ✅ |
| Gates CI | Todos passando: schema-usage, casts, simulate-schema (300 cenários) | ✅ |
| `fn_rate_limit_check` | `p_window_minutes` agora usado (floor epoch) | ✅ |
| 56 RPCs auditadas | 53/53 existem; 3 são mocks/fail-open | ✅ |

### Estado final do banco
- Schemas: `zapp` (313 tab, 405 views, 1025 fns) / `evo` (189 tab RLS 100%) / `public` (1 tab)
- anon: 0 funções executáveis, 0 views sem security_invoker
- SECDEF: 0 sem search_path fixo
- Realtime: `zapp.failed_messages` na publication ✅ (subscription com `schema:'zapp'`)
- Crons: 119 ativos (18 novo: bpm-check-breached-slas)

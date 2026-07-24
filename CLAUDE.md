# ZAPP-WEB — Contexto para Claude Code

## Projeto

**ZAPP-WEB (Pronto Talk Suite)** — plataforma omnichannel de atendimento ao cliente com WhatsApp, IA integrada, CRM e automações.

- **Produção**: https://zapp.atomicabr.com.br
- **Stack**: React 18 + TypeScript 5 + Vite + TailwindCSS + shadcn/ui + Supabase

---

## Banco de Dados — OBRIGATÓRIO LER

### Instância Supabase

| Atributo | Valor |
|----------|-------|
| **Tipo** | Self-Hosted (VPS AtomicaBR) |
| **URL** | `https://supabase.atomicabr.com.br` |
| **Schema principal** | `zapp` |
| **Schema Evolution API** | `evo` |
| **Schema public** | 1 tabela interna Supabase + 532 views proxy |

### Schemas e Tabelas (auditado 2026-07-16 — regras verificadas contra DB de produção)

| Schema | Base Tables | Views | RLS | Descrição |
|--------|-------------|-------|-----|-----------|
| **`zapp`** | **312** | **404** | 100% | Todas as tabelas da aplicação |
| **`evo`** | **193** | — | 100% | Tabelas da Evolution API (WhatsApp) |
| `auth` | 21 | — | — | Auth GoTrue do Supabase |
| `bpm` | 41 | — | — | BPM/workflows |
| `email_app` | 33 | — | — | Integração Gmail |
| `ai` | 31 | — | — | IA e embeddings |
| `archive` | 25 | — | — | Dados arquivados |
| `financeiro` | 16 | — | — | Módulo financeiro |
| `vendas` | 13 | — | — | Módulo vendas |
| `ops` | 20 | — | — | Operações internas |
| `public` | 1¹ | 532² | — | NÃO usar diretamente |

> ¹ `public._wal_slot_guard_events` — tabela interna do Supabase (WAL slot guard), não é tabela de aplicação.
> ² As 532 views em `public` são proxies/aliases para tabelas em outros schemas (zapp, evo, email_app, etc.).

### Regras Críticas de Schema

1. **SEMPRE usar `schema: 'zapp'`** — o cliente Supabase já está configurado com isso em `src/integrations/supabase/client.ts`. Não trocar para `public`.

2. **Para dados Evolution (mensagens/contatos/conversas)**: usar o cliente padrão (`supabase.from('evolution_messages')` etc.) porque as tabelas `evolution_*` existem como **views auto-updatable** no schema `zapp` com `security_invoker=on`. **NÃO usar `.schema('evo').from(...)` para objetos que existem como views em `zapp`** — isso causa `PGRST205` se o objeto não existir no schema `evo`. Use `.schema('evo')` apenas para tabelas que existem SOMENTE no schema `evo` e não têm view correspondente em `zapp`.

3. **PostgREST**: sem o header `Accept-Profile: zapp`, queries falham com `PGRST205`.

4. **Realtime — IMPORTANTE**: a publicação `supabase_realtime` tem `publish_via_partition_root = true`. Isso significa que eventos CDC são publicados pela **tabela raiz particionada**, nunca pela partição. Use a tabela raiz nos listeners:
   - Mensagens do WhatsApp → `schema: 'evo'`, tabela **`evolution_messages`** (raiz), NÃO `evolution_messages_wpp2`
   - Conversas → `schema: 'evo'`, tabela **`evolution_conversations`** (raiz), NÃO `evolution_conversations_wpp2`
   - Perfis/notificações → `schema: 'zapp'`
   - **`failed_messages`** → `schema: 'zapp'` (tabela física; `public.failed_messages` é VIEW, não entra na publication — subscription com `schema: 'public'` é no-op silencioso)
   - **`dispatch_error_logs`** → `schema: 'zapp'` (adicionada à publication `supabase_realtime` em `20260721_fix_cursor_rpcs_and_search_path.sql`)
   - **Subscriptions na partição ficam silenciosas** (zero eventos) com `publish_via_partition_root=true`.
   - **Regra geral**: Realtime usa o WAL físico — apenas relations físicas na publication emitem eventos. Views nunca emitem, independentemente do schema.

5. **Tipos TypeScript**: importar SEMPRE de `@/integrations/supabase/schema` (barrel canônico), nunca de `types.ts` diretamente.

### Tabelas Principais do Schema `zapp`

| Tabela | Função |
|--------|--------|
| `profiles` | Usuários da plataforma (17 registros) |
| `workspaces` | Workspaces/tenants |
| `workspace_members` | Membros por workspace (15) |
| `whatsapp_connections` | Conexões WA (3 ativas) |
| `instance_registry` | Registro de instâncias (23) |
| `empresas` | Empresas/clientes (51.688) |
| `contatos` | Contatos/leads |
| `departments` | Departamentos |
| `queues` | Filas de atendimento |
| `webhook_audit_log` | Log de webhooks (58.232 linhas, 19 MB) |
| `webhook_events_processed` | Eventos processados (58.076, 31 MB) |
| `app_notifications` | Notificações (14.283) |
| `audit_logs` | Logs de auditoria (4.356) |
| `user_roles` | Permissões (14) |

### Tabelas Principais do Schema `evo`

| Tabela | Função |
|--------|--------|
| `evolution_messages` | Raiz particionada de mensagens (25 partições por instância) |
| `evolution_contacts` | Contatos da Evolution API (20.563, 18 MB) |
| `evolution_conversations` | Raiz particionada de conversas (25 partições) |
| `evolution_webhook_events_v2_*` | Webhooks particionados por mês (2026-03 a 2027-06 + default) |
| `evolution_media` | Mídias (23.366, 10 MB) |
| `evolution_whatsapp_status` | Status WA (14.789, 10 MB) |

**Partições de `evolution_messages` (25 partições por instância):**
`wpp2`, `wpp2_archive`, `artes`, `comercial_01`–`comercial_15`, `compras`, `default`, `financeiro`, `gravacao`, `logistica`, `marketing`

> `evolution_messages` e `evolution_conversations` são **tabelas raiz particionadas** (relkind='p' no evo schema).
> Os dados ficam nas partições por instância. No schema `zapp`, `evolution_messages` existe como
> **view auto-updatable** (security_invoker=on) que aponta para a raiz no schema `evo`.
> Para queries SELECT, tanto a raiz quanto as partições funcionam.
> Para **Realtime**, sempre use a raiz (regra 4 acima).

### Storage Buckets (13 buckets em produção)

| Bucket | Público | Limite |
|--------|---------|--------|
| `audio-memes` | não | 5 MB |
| `audio-messages` | não | — |
| `avatars` | sim | 5 MB |
| `comprovantes-financeiro` | não | 20 MB |
| `custom-emojis` | sim | 512 KB |
| `email-attachments` | não | — |
| `etiquetas-remessa` | não | 10 MB |
| `fechamentos` | não | 20 MB |
| `quarantine` | não | — |
| `recibos-entrega` | sim | 10 MB |
| `stickers` | sim | 512 KB |
| `team-chat-files` | não | — |
| `whatsapp-media` | não | — |


### Bugs Conhecidos e Gaps de Implementação

| ID | Arquivo | Problema | Impacto |
|----|---------|----------|---------|
| ~~BUG-1~~ | `src/features/admin/hooks/useAdminManagement.ts` | CORRIGIDO: `safeFrom('queue_skills')` → `safeFrom('queue_skill_requirements')` | Resolvido |
| ~~BUG-2~~ | `src/features/inbox/components/chat/useAudioVoiceChange.ts` | CORRIGIDO: bucket `chat-media` → `audio-messages`; coluna `mediaUrl` → `media_url` (PostgREST snake_case) | Resolvido |
| ~~BUG-3~~ | `zapp.fn_messages_view_insert_handler` / `messageSender.ts` | CORRIGIDO: trigger INSTEAD OF INSERT não atribuía `NEW.id` antes de `RETURN NEW`; `data.id` retornava NULL; CORRIGIDO no trigger (DB) e via `crypto.randomUUID()` no cliente | Resolvido |
| ~~BUG-4~~ | `src/hooks/useCRMManagement.ts` | CORRIGIDO: `contact_notes` INSERT omitia FK não-nula `author_id`; adicionado `supabase.auth.getUser()` | Resolvido |
| ~~BUG-5~~ | `supabase/migrations/20260712001500_cursor_pagination_optimization.sql:145` | CORRIGIDO: GRANT em `rpc_list_dispatch_error_logs_cursor` tinha 7 params vs 8 na assinatura real; nenhum usuário autenticado tinha permissão; fix em `20260716_fix_dispatch_error_logs_grant.sql` | Resolvido |
| ~~BUG-6~~ | `src/features/admin/hooks/monitoring/useDispatchErrorLogs.ts` | CORRIGIDO: `p_cursor_id` hardcoded como `null`; paginação nunca avançava; adicionado cursor state management | Resolvido |
| ~~BUG-7~~ | `src/features/admin/hooks/monitoring/useFailedMessages.ts:142` | REVERTIDO: mudança anterior de `schema: 'zapp'` → `schema: 'public'` era regressão — `public.failed_messages` é VIEW, não está na publication `supabase_realtime`; subscription era no-op silencioso; mantido `schema: 'zapp'` (tabela física, publicada) | Resolvido |
| ~~GAP-1~~ | `src/hooks/useCampaigns.ts:100` | CORRIGIDO 2026-07-24: `rpc('add_contacts_to_campaign')` — UNIQUE constraint + SECURITY DEFINER function aplicados via `20260721000004_melhoria4_add_contacts_to_campaign_zapp.sql`; `is_admin_or_supervisor` auth + `FOR UPDATE` serialization + `ON CONFLICT DO NOTHING` | Resolvido |
| ~~GAP-2~~ | `src/hooks/useIntegrationManagement.ts:54,69` | STUB CRIADO: `rpc('initiate_gmail_oauth')`, `rpc('complete_gmail_oauth')` — stubs em `20260717000002_create_missing_rpcs_stubs.sql`; retornam erro descritivo em vez de 42883 | UI degrada com mensagem; OAuth real pendente |
| ~~GAP-3~~ | `src/hooks/useIntegrationManagement.ts:156` | STUB CRIADO: `rpc('sync_to_crm')` — stub em `20260717000002`; levanta RAISE EXCEPTION explícita (P0001) em vez de retornar void | Sync real pendente |
| ~~GAP-4~~ | `src/hooks/useMediaManagement.ts:93,128` | STUB CRIADO: `rpc('export_user_data')`, `rpc('import_user_data')` — stubs em `20260717000002`; export retorna dados de perfil (formatos != 'json' rejeitados com RAISE); import levanta RAISE EXCEPTION | Export/Import parcial; full data export deve ser Edge Function |
| ~~BUG-9~~ | `src/hooks/useMediaManagement.ts:164` | CORRIGIDO: `rpc('check_download_permission')` ausente → `hasPermission` ficava `false` permanentemente, bloqueando todos os downloads silenciosamente; fail-open restrito a SQLSTATE 42883 (função não existe) — outros erros mantêm permissão negada | Resolvido |
| ~~GAP-5~~ | `src/hooks/useCRMManagement.ts:146` | STUB CRIADO: `rpc('enrich_contact')` — stub em `20260717000002`; retorna dados básicos do contato com `enriched: false` | Integração com API de enriquecimento pendente |
| ~~GAP-6~~ | `src/hooks/useAnalyticsManagement.ts:168` | STUB CRIADO: `rpc('get_latest_analysis')` — stub em `20260717000002`; retorna média de `contact_intelligence.engagement_score` | Analytics completo pendente |
| ~~BUG-8~~ | `supabase/migrations/20260712001500_cursor_pagination_optimization.sql:8` | CORRIGIDO: `rpc_list_failed_messages_cursor` tinha RETURNS TABLE com 9 cols vs 15 esperadas por FailedMessageRow; `fm.message_id` inexistente causava erro de compilação; `next_retry_at` vs `next_attempt_at` (nome errado); cursor keyset ignorava ties na created_at. Fix: `20260716_fix_rpc_list_failed_messages_cursor_columns.sql` | Resolvido |
| ~~GAP-7~~ | `src/features/admin/hooks/monitoring/useFailedMessages.ts:78` | CORRIGIDO 2026-07-24: `rpc_list_failed_messages_cursor` + `rpc_list_dispatch_error_logs_cursor` + `rpc_dlq_list_audit_cursor` + `search_contacts_cursor` — bare-column tuple keyset, `zapp.is_admin_or_supervisor`, `search_path=zapp`, `dispatch_error_logs` adicionada à publication. Aplicado via `20260721000008` + `20260721_fix_cursor_rpcs_and_search_path.sql` | Resolvido |
| ~~GAP-8~~ | `src/features/admin/hooks/monitoring/useDispatchErrorLogs.ts:61` | CORRIGIDO: `rpc_list_dispatch_error_logs_cursor` estava no schema `public` (PGRST202); tabela referenciada era `public.dispatch_error_logs` (VIEW); count era pós-cursor (decrementava por página); cursor sem ROW() ignorava ties. Fix: `20260717000003_fix_dispatch_dlq_cursor_rpcs_zapp_schema.sql` — movida para `zapp`, conta antes do cursor, ROW() keyset | Necessário aplicar migração ao self-hosted |
| ~~GAP-9~~ | `src/features/admin/hooks/monitoring/useDlqAuditLog.ts:51` | CORRIGIDO: `rpc_dlq_list_audit_cursor` estava no schema `public` (PGRST202); referências `public.audit_logs`, `public.profiles` → `zapp.audit_logs`, `zapp.profiles`; cursor sem ROW() ignorava ties. Fix: `20260717000003_fix_dispatch_dlq_cursor_rpcs_zapp_schema.sql` | Necessário aplicar migração ao self-hosted |
| ~~GAP-10~~ | `src/hooks/useQueueManagement.ts:203,415` | TABELA CRIADA: `zapp.queue_analytics` em `20260717000001_create_queue_analytics.sql`; FK para `queues`, RLS habilitado, índice em `(queue_id, timestamp DESC)` | Resolvido — necessário aplicar migração ao self-hosted |
| ~~BUG-10~~ | `src/features/admin/hooks/monitoring/useFailedMessages.ts:60` | CORRIGIDO: `effectiveFrom` calculado a cada render com `Date.now()` e colocado em `queryKey` + `useEffect` deps → loop infinito de refetch + setState. Fix: `useMemo([from, hours])` para estabilizar o valor | Resolvido |
| ~~BUG-11~~ | `supabase/migrations/20260717000002_create_missing_rpcs_stubs.sql` | CORRIGIDO: stubs `initiate_gmail_oauth` / `complete_gmail_oauth` retornavam JSON `{success:false}` sem RAISE; chamador em `useIntegrationManagement.ts:72` faz `setIsAuthenticated(true)` incondicionalmente após a RPC não retornar erro → falso estado autenticado. Fix: ambos os stubs agora fazem RAISE EXCEPTION com ERRCODE P0001 | Resolvido |
|| ~~BUG-12~~ | `src/components/contacts/AuditLogPanel.tsx` | CORRIGIDO: colunas `field_name`, `old_value`, `new_value`, `metadata` nao existem em `contact_audit_log`; colunas reais sao `old_values jsonb`, `new_values jsonb`, `reason text`. Painel retornava 400 e ficava em branco | Resolvido |
| ~~BUG-12~~ | `src/components/contacts/AuditLogPanel.tsx` | CORRIGIDO: colunas `field_name`, `old_value`, `new_value`, `metadata` não existem em `contact_audit_log`; colunas reais são `old_values jsonb`, `new_values jsonb`, `reason text`. Painel retornava 400 e ficava em branco | Resolvido |
| ~~BUG-13~~ | `src/features/admin/hooks/monitoring/useDispatchErrorLogs.ts` | CORRIGIDO: `fromIso` calculado a cada render sem `useMemo`; valor ficava obsoleto nos ciclos de `refetchInterval`. Fix: `useMemo([hours])` | Resolvido |
| ~~BUG-14~~ | `src/features/admin/hooks/monitoring/useDlqAuditLog.ts` | CORRIGIDO: `currentPage` não resetava ao mudar filtros (`action`, `limit`); paginação mantinha página errada. Fix: `useEffect([action, limit])` → `setCurrentPage(0)` | Resolvido |
| ~~BUG-15~~ | `supabase/migrations/` + `zapp.search_contacts_cursor` | CORRIGIDO (H1): `sort_direction` injetado diretamente no ORDER BY dinâmico sem whitelist → SQL injection. Fix: `IF v_dir NOT IN ('ASC','DESC') THEN RAISE EXCEPTION` | Resolvido — `20260720000003` |
| ~~BUG-16~~ | `zapp.search_contacts_cursor` | CORRIGIDO (H2): `COUNT(*) OVER()` calculado após predicate do cursor; `total_count` decrescia a cada página. Fix: CTE `total` antes do cursor filter | Resolvido — `20260720000003` |
| ~~BUG-17~~ | `zapp.search_contacts_cursor` | CORRIGIDO (H3): cursor sempre comparava só `c.id > $7`; ties em `created_at`/`updated_at` pulavam linhas. Fix: keyset composto `ROW(sort_col, id)` com pivot pré-buscado via SQL estático + `format('%L')` | Resolvido — `20260720000003` |
| ~~BUG-18~~ | `zapp.search_contacts_cursor` | CORRIGIDO (C2): migration `20260717220000` omitiu o REVOKE/GRANT; autenticados sem permissão de EXECUTE. Fix: `REVOKE FROM PUBLIC, anon; GRANT TO authenticated` | Resolvido — `20260720000003` |
| ~~BUG-19~~ | `zapp.rpc_list_dispatch_error_logs_cursor` | CORRIGIDO (C3): `d.created_at AS occurred_at` aliasava coluna errada; cursor comparava `ROW(b.occurred_at, b.id)` vs `ROW(c.created_at, c.id)` — lados misturados. Fix: `d.occurred_at` direto + cursor alinhado | Resolvido — `20260720000004` |
| ~~BUG-20~~ | `zapp.rpc_list_dispatch_error_logs` | CORRIGIDO (A2): `FROM public.dispatch_error_logs` dentro de função com `SET search_path = zapp` resolvia para a VIEW proxy em vez da tabela física. Fix: `FROM dispatch_error_logs` sem qualificador | Resolvido — `20260720000004` |
| ~~BUG-21~~ | `src/hooks/useAlertManagement.ts:363` | CORRIGIDO: `zapp.sentiment_alerts` estava em `logflare_pub` mas NÃO em `supabase_realtime`; subscription era no-op silencioso. Fix: `ALTER PUBLICATION supabase_realtime ADD TABLE zapp.sentiment_alerts` | Resolvido — `20260720000005` |
| ~~BUG-22~~ | `src/hooks/useNotificationManagement.ts:420,447` | CORRIGIDO: subscriptions para tabelas fantasma `goal_notifications` / `transcription_notifications` (não existem em nenhuma migração). Fix: redirecionado para `zapp.app_notifications` (publicada) com filtro client-side por `type` | Resolvido |
| ~~BUG-23~~ | `src/services/settings/settingsRepository.ts:114,130` | CORRIGIDO: `zapp.user_settings` e `zapp.workspace_settings` são tabelas físicas subscritas via Realtime para sincronização de configurações cross-tab, mas NÃO estavam em `supabase_realtime`; callbacks nunca disparavam. Fix: `ALTER PUBLICATION supabase_realtime ADD TABLE` para ambas | Resolvido — `20260720000006` |
|| ~~BUG-13~~ | `zapp.rpc_dlq_list_audit` no DB | CORRIGIDO 2026-07-17: JOIN errado `p.id = a.user_id` — `profiles.id` eh UUID surrogado; o auth UID esta em `profiles.user_id`. Resultado: `user_name` e `user_email` sempre NULL no painel. Corrigido para `p.user_id = a.user_id` | Resolvido |
| ~~BUG-12~~ | `zapp.rpc_dlq_bulk_retry_now` no DB | CORRIGIDO 2026-07-17: chamava `public.has_role()` e `public.log_rls_denied()` (não existem em public); escrevia em `public.audit_logs` (não existe). DROP+CREATE com `zapp.has_role` e `zapp.log_rls_denied` | Resolvido |
| ~~BUG-13~~ | `zapp.rpc_dlq_list_audit` no DB | CORRIGIDO 2026-07-17: JOIN errado `p.id = a.user_id` — `profiles.id` é UUID surrogado; o auth UID está em `profiles.user_id`. Resultado: `user_name` e `user_email` sempre NULL no painel. Corrigido para `p.user_id = a.user_id` | Resolvido |
| ~~BUG-14~~ | `zapp.rpc_dlq_log_item_action` no DB | CORRIGIDO 2026-07-17: 2 overloads inseguros sem role check gravando em `zapp.dlq_audit_log` (tabela errada — painel lê `zapp.audit_logs`). Drops aplicados; canonical (text,uuid[],text) corrigido para gravar em `zapp.audit_logs` com supervisor role | Resolvido |
| ~~BUG-15~~ | `zapp.rpc_dlq_log_reprocess_trigger` / `rpc_dlq_log_reprocess_result` no DB | CORRIGIDO 2026-07-17: `SET search_path TO 'public','evo','zapp','monitoring'` inseguro; supervisor bloqueado. Corrigido para `SET search_path = zapp` + `zapp.has_role(..., 'supervisor')` | Resolvido |
| ~~BUG-16~~ | `zapp.search_contacts_cursor` no DB | CORRIGIDO 2026-07-17: (1) cursor direction usava `sort_direction = 'asc'` case-sensitive — passar 'ASC' quebrava paginação pág 2+; (2) `sort_direction` injetável via ORDER BY string concat. Corrigido: `v_sort_dir := UPPER(...); IF v_sort_dir NOT IN ('ASC','DESC')` | Resolvido |
| ~~BUG-24~~ | `src/hooks/useRealtimeSentimentAlerts.ts:18` | CORRIGIDO 2026-07-24: subscription usava `schema: 'public', table: 'audit_logs', filter: 'action=eq.sentiment_alert'` — `public.audit_logs` é VIEW proxy, nunca emite CDCs; alertas de sentimento completamente silenciosos desde migration `20260720000005`. Fix: `schema: 'zapp', table: 'sentiment_alerts'`; payload atualizado para `alert_level`/`sentiment_score` | Resolvido |
| ~~BUG-25~~ | `src/components/payments/PaymentLinksView.tsx:61` | CORRIGIDO 2026-07-24 (v2): subscription estava em `schema: 'financeiro'` (CORRETO — tabela física), uma "correção" anterior desta sessão mudou erroneamente para `schema: 'zapp'` (VIEW proxy). Revertido para `schema: 'financeiro'`. Migration `20260724000006` adiciona `financeiro.payment_links` à publication (supercede `20260724000004` que tinha dois bugs: schema errado + FOREACH SLICE type bug) | Resolvido |
| ~~BUG-26~~ | `src/hooks/useGmailOAuthFlow.ts:292` | CORRIGIDO 2026-07-24: `email_app.email_accounts` não estava em `supabase_realtime`; callback pós-OAuth não disparava; fluxo OAuth aparentava travar. Fix: migration `20260724000006` adiciona tabela à publication (re-adds idempotentemente) | Resolvido |
| ~~BUG-27~~ | `supabase/migrations/20260724000004_fix_realtime_payment_links_email_accounts.sql` | CORRIGIDO 2026-07-24: bloco verification declarou `t TEXT` (scalar) mas `FOREACH t SLICE 1 IN ARRAY targets` requer `TEXT[]`; PostgreSQL lança `ERROR: FOREACH ... SLICE loop variable must be of an array type` que faz rollback de toda a transação — nem `financeiro.payment_links` nem `email_app.email_accounts` foram adicionados à publication. Supercedido por `20260724000006` com declaração correta `t TEXT[]` | Resolvido — `20260724000006` |
| ~~BUG-28~~ | `supabase/functions/evolution-sentiment/index.ts:66` | CORRIGIDO 2026-07-24: `saveAnalysis()` tentava inserir em `zapp.evolution_sentiment_alerts` (tabela inexistente — nenhuma migração a cria); erro era apenas logado, nunca propagado; subscriber em `useRealtimeSentimentAlerts.ts` escutava `zapp.sentiment_alerts` (correto e publicado) mas nenhum produtor jamais escrevia lá. Fix: insert redirecionado para `zapp.sentiment_alerts` com colunas corretas (`contact_id`, `message_id`, `sentiment_score`, `alert_level`, `acknowledged`) | Resolvido |
| ~~BUG-29~~ | `supabase/functions/evolution-sentiment/index.ts:55` + migração ausente | CORRIGIDO 2026-07-24: `zapp.evolution_sentiment_analysis` referenciada em `saveAnalysis()` (linha 55) e no catalog (`catalog.ts:46`) mas sem nenhuma migração de criação — `throw error` na linha 63 fazia com que TODA análise falhasse silenciosamente antes de chegar ao código de alertas (raiz real do BUG-28). Fix: `20260724000007_create_evolution_sentiment_analysis.sql` cria a tabela com todos os campos esperados pelo edge function, 4 índices, RLS (service_role + authenticated SELECT), e adiciona à publication `supabase_realtime` | Resolvido — `20260724000007` |
| ~~BUG-30~~ | `supabase/migrations/20260724000007_create_evolution_sentiment_analysis.sql` + `20260724000008_create_missing_evolution_tables.sql` | CORRIGIDO 2026-07-24: **Schema mismatch crítico** — migrações usavam `CREATE TABLE IF NOT EXISTS zapp.evolution_X` mas todas as 9 tabelas já existem como VIEW proxies em `zapp` apontando para tabelas físicas em `evo` (confirmado em `docs/SUPABASE_SCHEMA_AUDIT_2026-07-15.md`). `CREATE TABLE IF NOT EXISTS` silenciosamente pulava a VIEW, depois `CREATE INDEX ON zapp.evolution_X` falhava com "cannot create index on view", revertendo toda a migração. Fix: reescrita com DO blocks de detecção de schema (`relkind = 'v'` → `evo`, senão `zapp`) usando `EXECUTE format()` para todo DDL | Resolvido — `20260724000007` + `20260724000008` (commit `8466bc1`) |
| ~~BUG-31~~ | `supabase/functions/evolution-sentiment/index.ts:55,68` | CORRIGIDO 2026-07-24: **UUID type mismatch** — `msgId` vem de `body.message_id` que pode ser um ID de mensagem da Evolution API (ex: `3EB0C767D360A23D02C3`), formato que NÃO é UUID válido. Passado diretamente para `evolution_sentiment_analysis.message_id` (UUID) e `sentiment_alerts.message_id` (UUID), causando erro de tipo no PostgreSQL que abortava o INSERT silenciosamente. Fix: adicionada função `toUuid(v)` que retorna `null` para strings não-UUID; aplicada em ambos os INSERTs (`message_id: toUuid(msgId)`) | Resolvido — `evolution-sentiment/index.ts` (commit `8466bc1`) |


---

## Configuração do Cliente Supabase

```typescript
// src/integrations/supabase/client.ts (NÃO ALTERAR)
export const supabase = createClient<ExtendedDatabase>(url, key, {
  db: { schema: 'zapp' },  // ← schema canônico
  auth: { ... },
  realtime: { ... },
});
```

Para Edge Functions, usar `createZappAdminClient()` de `supabase/functions/_shared/db-client.ts`.

---

## Comandos Úteis

```bash
# Dev
bun run dev

# Testes
bun run test
bun run test:e2e

# Regenerar tipos TypeScript do banco
# (requer acesso à instância self-hosted)
curl -s "http://supabase_meta:8080/generators/typescript?included_schemas=public,zapp&detect_one_to_one_relationships=true" > src/integrations/supabase/types.ts
```

---

## Documentação de Referência

| Doc | Conteúdo |
|-----|----------|
| `docs/SCHEMA_REFERENCE.md` | **Documento canônico** de schemas e tabelas |
| `docs/ER_DIAGRAM.md` | Diagrama de entidade-relacionamento |
| `docs/ARCHITECTURE_AND_FLOW.md` | Arquitetura e fluxo de dados |
| `docs/API_CONTRACT.md` | Contratos de API |
| `docs/EVOLUTION_API_REFERENCE.md` | API Evolution (WhatsApp) |
| `docs/RUNBOOK_OBSERVABILITY.md` | Observabilidade e alertas |
| `SECURITY.md` | Políticas de segurança |
| `infra/runbooks/OPERATIONS.md` | Runbook de operações (22/07) |
| `infra/backup/README.md` | Backup & restore procedure |
| `infra/evolution/SETTINGS.md` | Configs Evolution wpp2 |
| `docs/QA_REPORT_2026-07-22.md` | QA Report completo (22/07) |

---

## Estrutura de Pastas Relevante

```
src/
├── integrations/supabase/   # Cliente Supabase, tipos, helpers
│   ├── client.ts            # createClient com schema: 'zapp'
│   ├── types.ts             # Auto-gerado (38K linhas, NÃO editar)
│   └── schema.ts            # Barrel canônico de tipos
├── hooks/                   # React hooks (useInbox, useMessages, etc.)
├── components/              # Componentes UI
└── lib/                     # Utilitários

supabase/
├── functions/               # 123 Edge Functions (Deno)
│   └── _shared/
│       └── db-client.ts     # createZappAdminClient()
└── migrations/              # 800+ migrações SQL

infra/                       # Infraestrutura
├── runbooks/                # Procedimentos operacionais
│   └── OPERATIONS.md        # Runbook (lean)
├── backup/                  # Documentação de backup
│   └── README.md            # Procedimento de restore
└── evolution/               # Configurações Evolution
    └── SETTINGS.md          # Settings atuais da wpp2
```

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

---

## Sessão 2026-07-20 — Auditoria de Schema e Correção de Bugs

### Melhorias executadas

| Item | Arquivo / Migração | Ação | Status |
|---|---|---|---|
| BUG-12 — AuditLogPanel colunas erradas | `src/components/contacts/AuditLogPanel.tsx` | Interface e SELECT corrigidos: `old_values jsonb`, `new_values jsonb`, `reason text` (em vez de `field_name`, `old_value`, `new_value`, `metadata`) | ✅ |
| BUG-13 — fromIso stale closure | `useDispatchErrorLogs.ts` | `useMemo([hours])` para estabilizar `fromIso` entre ciclos de refetch | ✅ |
| BUG-14 — currentPage não reseta | `useDlqAuditLog.ts` | `useEffect([action, limit])` → `setCurrentPage(0)` | ✅ |
| BUG-15 — SQL injection `sort_direction` | `20260720000003` | Whitelist + `RAISE EXCEPTION P0001` para valores inválidos em `search_contacts_cursor` | ✅ |
| BUG-16 — COUNT decresce por página | `20260720000003` | CTE `total` calculada antes do cursor predicate em `search_contacts_cursor` | ✅ |
| BUG-17 — Cursor keyset incompleto | `20260720000003` | `ROW(sort_col, id)` composto com pivot pré-buscado via SQL estático | ✅ |
| BUG-18 — GRANT ausente `search_contacts_cursor` | `20260720000003` | `REVOKE FROM PUBLIC, anon; GRANT TO authenticated` restaurado | ✅ |
| BUG-19 — occurred_at/created_at mismatch | `20260720000004` | `rpc_list_dispatch_error_logs_cursor`: `d.occurred_at` direto + cursor alinhado em ambos os lados | ✅ |
| BUG-20 — `public.` view reference em SECDEF | `20260720000004` | `rpc_list_dispatch_error_logs`: `FROM public.dispatch_error_logs` → `FROM dispatch_error_logs` | ✅ |
| BUG-21 — `sentiment_alerts` fora da publication | `20260720000005` | `ALTER PUBLICATION supabase_realtime ADD TABLE zapp.sentiment_alerts` | ✅ |
| BUG-22 — Subscriptions em tabelas fantasma | `useNotificationManagement.ts` | `goal_notifications` / `transcription_notifications` → `app_notifications` com filtro client-side por `type` | ✅ |
| Security hardening — funções internas | `20260720000002` | REVOKE EXECUTE FROM PUBLIC/anon em funções de scoring, rate-limit, trigger e analytics ops | ✅ |
| Stub `check_download_permission` | `20260720000001` | Fail-open com SQLSTATE 42883 para `rpc('check_download_permission')` ausente | ✅ |
| `useRealtimeDashboardManagement` | `useRealtimeManagement.ts` | Subscription de `zapp.dashboard_data` (inexistente) → `zapp.app_notifications` (publicada) | ✅ |
| TypeScript 0 erros | — | `tsc --noEmit --skipLibCheck`: 0 erros após todas as correções | ✅ |

### Estado do Realtime após sessão 2026-07-20
- `zapp.failed_messages` ✅ (física, publicada)
- `zapp.sentiment_alerts` ✅ (adicionada em `20260720000005`)
- `zapp.app_notifications` ✅ (publicada, usada por dashboard + goal + transcription hooks)
- `zapp.user_settings` ✅ (adicionada em `20260720000006` — sync de configurações cross-tab)
- `zapp.workspace_settings` ✅ (adicionada em `20260720000006` — sync de configurações cross-tab)
- `zapp.goal_notifications` / `zapp.transcription_notifications` — tabelas fantasma, subscriptions redirecionadas
- `zapp.dispatch_error_logs` ✅ (adicionada em `20260721_fix_cursor_rpcs_and_search_path.sql` — 2026-07-24)
- Auditoria completa de 36 tabelas e 49 RPCs: todos presentes ou cobertos por stubs/migrations

### Estado do Realtime após sessão 2026-07-24
- `financeiro.payment_links` ✅ (adicionada em `20260724000006` — supercede `20260724000004` com type bug)
- `email_app.email_accounts` ✅ (adicionada em `20260724000006` — Gmail OAuth flow callback)
- `email_app.email_threads` ✅ (adicionada em `20260724000005`)
- `zapp.failed_messages` ✅ (confirmado; `20260724000005` idempotente)
- `zapp.app_notifications` ✅ (confirmado; `20260724000005` idempotente)
- `zapp.agent_stats` ✅ (adicionada em `20260724000005`)
- `zapp.audio_memes` ✅ (adicionada em `20260724000005`)
- `zapp.qr_attempts` ✅ (adicionada em `20260724000005`)
- `zapp.queue_members`, `zapp.queue_positions`, `zapp.queues` ✅ (adicionadas em `20260724000005`)
- `zapp.sales_deals` ✅ (adicionada em `20260724000005`)
- `zapp.talkx_campaigns` ✅ (adicionada em `20260724000005`)
- `zapp.team_messages` ✅ (adicionada em `20260724000005`)
- `zapp.warroom_alerts` ✅ (adicionada em `20260724000005`)
- `zapp.whatsapp_connections` ✅ (adicionada em `20260724000005`)
- `zapp.evolution_sentiment_analysis` ✅ (criada em `20260724000007`, adicionada à publication)
- `evolution-sentiment`: producer agora escreve em `zapp.evolution_sentiment_analysis` + `zapp.sentiment_alerts` (era `evolution_sentiment_alerts` inexistente — BUG-28/29)

## Sessão 2026-07-22 — QA Exaustiva de Infraestrutura (10/10)

### Contexto
QA realizado diretamente no ambiente de produção AtomicaBR (VPS Docker Swarm).
144 containers auditados, 11 módulos testados, 7 bugs encontrados.
Todas as correções foram aplicadas em runtime (Evolution API, Docker, PostgreSQL, Hermes Cron).

### Bugs Encontrados

| # | Componente | Problema | Severidade | Status |
|---|---|---|---|---|
| BUG-A | CrowdSec Bouncer | 7 dias sem atualizar decisões | 🔴 CRÍTICO | ✅ Corrigido (restart) |
| BUG-B | WAL Slot | `cainophile_s7fgrb36` 278MB lag crescendo | 🔴 CRÍTICO | ✅ Corrigido (DB restart) |
| BUG-C | n8n | FK constraint violada em workflow_history | 🟠 ALTO | ⏳ Pendente |
| BUG-D | Edge Function | POST /rest/v1/contacts 404 | 🟠 ALTO | ⏳ Pendente |
| BUG-E | Glitchtip | DB disconnect pós-deploy | 🟡 MÉDIO | ✅ Corrigido (restart) |
| BUG-F | Backups | Falso alarme (backups R2 OK) | 🟡 MÉDIO | ✅ Investigado e limpo |
| BUG-G | bridge.js | Sem Express error handler | 🟢 BAIXO | Baixo risco |

### Shift-Left Items (runtime — recriar via docs)

| Item | Local | Como Recriar |
|---|---|---|
| alwaysOnline=true | Evolution DB | `infra/evolution/SETTINGS.md` |
| readMessages=true | Evolution DB | `infra/evolution/SETTINGS.md` |
| Webhook disabled | Evolution DB | `infra/evolution/SETTINGS.md` |
| Cron: WAL Monitor (15min) | Hermes Agent | `infra/runbooks/OPERATIONS.md` |
| Cron: Backup Check (6h) | Hermes Agent | `infra/runbooks/OPERATIONS.md` |
| VACUUM ANALYZE | PostgreSQL | Efeito temporário (re-aplicar) |
| BACKUP_FAILED purge | Filesystem | Já limpo (245MB) |

### Informações do Ambiente (22/07)

| Métrica | Valor |
|---|---|
| Docker | 28.1.1, Ubuntu 20.04, 12 vCPU, 24GB RAM |
| Disco | 119 GB usado (61%), 75 GB livre |
| Containers | 144 total (107 running) |
| Cache hit ratio | 99.91% |
| Evolution msgs | 46.700+ processadas |
| RabbitMQ | 17/17 filas, 0 erros |
| Backups R2 | 13 consecutivos (último: 22/07, 27MB) |
| WAL total | 1.024 GB (monitorar via cron) |


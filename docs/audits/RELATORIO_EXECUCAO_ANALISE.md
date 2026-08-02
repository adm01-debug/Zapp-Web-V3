# RELATÓRIO DE EXECUÇÃO DA ANÁLISE — `zapp-web-v3`

> Documento vivo. Atualizado bloco a bloco conforme o `PLANO_QA_ANALISE_100.md` é executado.
> Cada etapa fechada gera 0..N achados; achados vão para `PLANO_IMPLEMENTACAO_100.md`.

---

## Estado geral

| Bloco | Descrição | Status | Achados |
|---|---|---|---|
| 1 | Inventário estrutural e mapeamento (1-10) | ✅ Concluído | 14 (F1-01 a F1-14) |
| 2 | Auditoria do banco (11-20) | ✅ Concluído | 13 (F2-01 a F2-13) |
| 3 | Autenticação e sessão (21-30) | ✅ Concluído | 12 (F3-01 a F3-12) |
| 4 | Inbox e mensageria (31-45) | ✅ Concluído | 24 (F4-01 a F4-24) |
| 5 | Contatos e CRM (46-55) | ✅ Concluído | 30 (F5-01 a F5-30) |
| 6 | Conexões WhatsApp (56-65) | ✅ Concluído | 30 (F6-01 a F6-30) |
| 7 | Admin e monitoramento (66-75) | ✅ Concluído | 32 (F7-01 a F7-32) |
| 8 | SLA/BPM (76-80) | ✅ Concluído | 15 (F8-01 a F8-15) |
| 9 | Resiliência e edge cases (81-90) | ⏸ Pendente | — |
| 10 | Cross-browser / a11y / perf (91-100) | ⏸ Pendente | — |

**Achados até aqui: 170 (14 Bloco 1 + 13 Bloco 2 + 12 Bloco 3 + 24 Bloco 4 + 30 Bloco 5 + 30 Bloco 6 + 32 Bloco 7 + 15 Bloco 8).**

---

## Bloco 1 — Inventário estrutural (etapas 1-10)

Higienização do repositório, gates de CI/qualidade e arquitetura de frontend/router. 14 achados F1-01 a F1-14 detalhados em `PLANO_IMPLEMENTACAO_100.md` Temas 1, 2 e 6.

Achados agrupados abaixo pelos Temas 1, 2, 6 do plano. Cada item referencia a numeração de `PLANO_IMPLEMENTACAO_100.md`; consultar o plano para causa raiz completa, arquivo/linha e correção proposta.

### Higienização do repositório (Tema 1)

- **F1-01** — Deletar `___TEMP_VERSION_CHECK_DO_NOT_MERGE.txt`
- **F1-02** — Ignorar e remover `__pycache__/`
- **F1-03** — Mover scripts soltos para `scripts/`
- **F1-04** — Migrar `lgpd_deploy.sql` para `supabase/migrations/`
- **F1-05** — Mover 8 relatórios `.md` da raiz para `docs/audits/history/`
- **F1-06** — Deletar duplicata `playwright.e2e.config.fixed.ts`
- **F1-07** — Consolidar 5 pastas de teste em `src/**/__tests__/` + `e2e/`
- **F1-08** — Deletar `supabase/functions-legacy/` (grep imports antes)
- **F1-09** — Mover/deletar `supabase/fatorx-migrations/` (projeto errado)

### Gates de CI e qualidade (Tema 2)

- **F1-10** — Remover `|| true` do script `lint` em `package.json`
- **F1-11** — Reduzir `--max-warnings 999 → 0` progressivamente

### Frontend: router, navegação, arquitetura (Tema 6)

- **F1-12** — Homônimos em `src/pages/` — padronizar `<slug>/index.tsx`
- **F1-13** — 11 pages órfãs (sem `<Route>`) mas lazy-carregadas — decidir URL ou `?view=`
- **F1-14** — Consolidar padrão duplo URL canônica vs `?view=X&tab=Y`

---

## Bloco 2 — Auditoria do banco (etapas 11-20)

Segurança Supabase (SECDEF/RLS/EXECUTE grants), performance de banco e consolidação de cron jobs. 13 achados F2-01 a F2-13 detalhados em `PLANO_IMPLEMENTACAO_100.md` Temas 3, 4 e 5.

Achados agrupados abaixo pelos Temas 3, 4, 5 do plano. Cada item referencia a numeração de `PLANO_IMPLEMENTACAO_100.md`; consultar o plano para causa raiz completa, arquivo/linha e correção proposta.

### Segurança Supabase (Tema 3)

- **F2-01** — Revogar `EXECUTE` de `authenticated` nas 6 TRIGGER functions em `public`
- **F2-02** — Revogar `EXECUTE` de `authenticated` nas 3 outras TRIGGER functions em `public`
- **F2-03** — Revisar 9 RPCs SECDEF em `public` — garantir `auth.uid()` + tenant check
- **F2-04** — Auditoria CSV das 119 SECDEF+authenticated em `zapp` (`docs/audits/secdef-zapp.csv`)
- **F2-05** — Auditoria similar em `financeiro` (25), `artes` (11), `vendas` (5)

### Performance de banco (Tema 4)

- **F2-09** — Mover `ops.fn_regression_tests()` para off-peak + MV cached (8,8 s/call → 0)
- **F2-10** — Consolidar 588 042 INSERTs unitários em `financeiro.pagamentos_diarios` para batch
- **F2-11** — Investigar `zapp.fn_system_health_score_cached` (289 ms apesar do nome "_cached")
- **F2-12** — Reduzir invalidações do PostgREST schema cache (203 s totais em introspection)
- **F2-13** — Índice parcial em `zapp.messages` para badge unread inbound

### Consolidação de cron jobs (Tema 5)

- **F2-06** — Consolidar 4 pares de duplicatas de cron
- **F2-07** — Escalonar 6 VACUUMs diários (02:06–02:21) em janelas > 5 min
- **F2-08** — Reagrupar chain logflare (7 jobs, 03:00–03:45) em job único

---

## Bloco 3 — Autenticação e sessão (etapas 21-30)

Frontend de autenticação e sessão (`ProtectedRoute`, `refreshAll`, `signOut`, cookie storage). 12 achados F3-01 a F3-12 detalhados em `PLANO_IMPLEMENTACAO_100.md` Tema 7.

Achados agrupados abaixo pelos Temas 7 do plano. Cada item referencia a numeração de `PLANO_IMPLEMENTACAO_100.md`; consultar o plano para causa raiz completa, arquivo/linha e correção proposta.

### Frontend: auth e sessão (Tema 7)

- **F3-01** (P0) — `supabase.auth.getSession()` fora de `useEffect` em `ProtectedRoute.tsx`
- **F3-02** — `isDev` bypass total sem log de auditoria
- **F3-03** — `verifyHttpOnlyCookieAuth()` é dead code — remover
- **F3-04** — `refreshAll` sem `AbortController` — race em `TOKEN_REFRESHED` consecutivo
- **F3-05** — Parsing frágil de `role_permissions` — pode retornar `permissions = []` silenciosamente
- **F3-06** — Realtime `zapp.profiles` só captura UPDATE — trocar para `event: '*'`
- **F3-07** — `retryBootstrap()` pode empilhar `getSession()` sob `navigator.locks`
- **F3-08** — Deletar `externalSessionBridge.ts` — dead code ativo
- **F3-09** — `signOut` sem fallback local se supabase-js falhar
- **F3-10** — `QuotaExceededError` silenciado em cookieStorage — CustomEvent + toast
- **F3-11** — `markTimeToMainScreen` triplicado no ProtectedRoute — guard com `useRef`
- **F3-12** — `log_security_event` sem contexto (tenant/UA/IP) — enriquecer

---

## Bloco 4 — Inbox e mensageria (etapas 31-45)

Frontend de inbox e mensageria — envio, reconciliação de delivery, media cache, filas outbound e crons de suporte. 24 achados F4-01 a F4-24 detalhados em `PLANO_IMPLEMENTACAO_100.md` Tema 8.

Achados agrupados abaixo pelos Temas 8 do plano. Cada item referencia a numeração de `PLANO_IMPLEMENTACAO_100.md`; consultar o plano para causa raiz completa, arquivo/linha e correção proposta.

### Frontend: inbox e mensageria (Tema 8)

- **F4-01** — `fetchConversations` sem cursor/paginação (500+1000 fixo)
- **F4-02** — `fetchConversations` sem guard de mount para setState/commitConversations
- **F4-03** — Channel realtime com nome aleatório (`Math.random()`)
- **F4-04** — `conversationSendState` computed fora de `useMemo`
- **F4-05** — `USE_EXTERNAL_DB = true` hardcoded
- **F4-06** — `handleSelectConversation` chama `evolution-api/read-messages` fire-and-forget
- **F4-07** — Reconciliação de delivery limitada a `.slice(-10)`
- **F4-08** — `seededAvatarsRef` sem limpeza — memory leak
- **F4-09** — `convProbeRef` log de debug em produção
- **F4-10** — `processedDeliveriesRef` (Set) cresce sem cap
- **F4-11** — `localStorage.setItem` sem try/catch em useMessageQueue
- **F4-12** — `beforeunload` handler ausente — cascade de sends no próximo load
- **F4-13** — Classificação de erro sem diferenciar retryable
- **F4-14** — `dbFrom('failed_messages').insert` falha silenciosa
- **F4-15** — `sendMessageToContact` faz 8 round-trips por mensagem
- **F4-16** — `buildSendIdempotencyKeyFromFingerprint` 5min bucket colide
- **F4-17** — `messageSender.audit_logs` fire-and-forget sem retry
- **F4-18** — `retry_attempt` e `error_reason` 100% NULL em `messages` (bug de persistência)
- **F4-19** — `extractEvolutionMessageId` pode retornar null; msgs sent sem external_id
- **F4-20** — `useMediaUrl.refreshCache` sem cap (potencial 100s MB)
- **F4-21** — `buildFileHash(originalUrl) != buildFileHash(dataUrl)` — cache DB nunca hit
- **F4-22** — `media_cache.storage_path` armazenando data URL base64 (anti-pattern)
- **F4-23** — Cron `retry-stuck-messages` opera em tabela vazia (`outbound_message_queue`) — 23 msgs pending há 5 dias
- **F4-24** — Cron `media_pipeline_health_check` (jobid 213) falha por schema drift

---

## Bloco 5 — Contatos e CRM (etapas 46-55)

Camada `zapp.contacts` (view + triggers), CPF/CNPJ, normalização de telefone, RLS de contatos, notas, tags, LGPD e busca. 30 achados F5-01 a F5-30 detalhados em `PLANO_IMPLEMENTACAO_100.md` Tema 11. Base factual medida em 02/08/2026 — resumo: 20 445 contatos com 0 registros de consent LGPD, `zapp.contact_notes` = 0 rows, `zapp.merge_contacts()` levanta EXCEPTION em runtime.

Achados agrupados abaixo pelos Temas 11 do plano. Cada item referencia a numeração de `PLANO_IMPLEMENTACAO_100.md`; consultar o plano para causa raiz completa, arquivo/linha e correção proposta.

### Contatos e CRM (Tema 11)

- **F5-01** (P0) — view `zapp.contacts` descarta silenciosamente CPF, endereço, is_blocked/is_favorite e vários outros campos
- **F5-02** (P0) — trigger UPDATE da view `zapp.contacts` dropa campos LGPD, soft-delete, workspace e AI (mesmo padrão do F4-18)
- **F5-03** (P0) — trigger DELETE da view faz HARD DELETE — viola requisito LGPD de soft-delete com undo 30d
- **F5-04** (P0) — `zapp.merge_contacts()` LEVANTA EXCEPTION 'implementacao pendente (etapa 30)' — merge está morto desde deploy
- **F5-05** (P0) — `bulk_soft_delete_contacts` referencia colunas `deleted_by`, `deleted_reason` que NÃO existem na view `zapp.contacts` — RPC falha em cada chamada
- **F5-06** (P0) — sem coluna CPF em `evo.evolution_contacts` e sem coluna CNPJ em lugar nenhum — feature de validação é impossível
- **F5-07** (P0) — sem `validate_cpf(text)` nem `validate_cnpj(text)` no banco — só `mask_cpf`
- **F5-08** (P0) — 5 estratégias diferentes de normalização de telefone — merge, search e intelligence usam estratégias divergentes
- **F5-09** (P0) — `add_contact_note` DESCARTA `p_note_type` e `p_is_pinned` silenciosamente — colunas não existem em `zapp.contact_notes`
- **F5-10** (P0) — `useContactNotes.addNote` BYPASSA a RPC — INSERT direto na tabela contorna toda validação de segurança
- **F5-11** (P0) — `zapp.contact_notes` **VAZIA** em produção (0 rows) — feature 100% dead
- **F5-12** (P0) — `search_contacts_cursor` NÃO usa `pg_trgm` — full scan em ILIKE
- **F5-13** (P0) — `zapp.tags.name` UNIQUE global — cross-workspace conflict impossibilita multi-tenant real
- **F5-14** (P0) — RLS `evo.evolution_contacts.contacts_insert` policy tem `WITH CHECK NULL` — anyone pode inserir contato com qualquer `assigned_to`
- **F5-15** (P0) — RLS `contacts_select` expõe contatos `assigned_to IS NULL` a TODOS os usuários — cross-tenant leak
- **F5-16** (P0) — `get_default_workspace_id()` retorna workspace mais antigo — sem tenant isolation em contatos
- **F5-17** — `bulk_add_tag` sem cap de tamanho + sem visibility check por contato
- **F5-18** — `bulk_auto_merge_duplicates` seleção de primário sem regra LGPD explícita — pode migrar consent errado
- **F5-19** — `get_contact_intelligence_by_phone` lê SÓ `evo.evolution_messages_wpp2` — multi-instância bug
- **F5-20** — `contacts_count_by_type` SECURITY DEFINER sem filtro por workspace — data leak agregado
- **F5-21** — `search_contacts_cursor` faz COUNT CTE em cada página — custo dobrado
- **F5-22** — `search_contacts_cursor` sem normalização de phone na busca — busca por telefone formatado falha
- **F5-23** — `search_contacts_cursor` só busca em `name`, `email`, `phone` — não busca em company, job_title, nickname, cpf
- **F5-24** — `useContactsSearch.pageIndexToCursor` sem deep-link support — jump-to-page-N via URL retorna page 0
- **F5-25** — `useContactNotes` N+1 query + sem pagination + sem edit mutation
- **F5-26** — 20445 contatos, ZERO com `lgpd_consent_at` ou `lgpd_opt_out_at` set — compliance LGPD ausente
- **F5-27** — Trigger INSERT view assume individual (`@s.whatsapp.net`) — quebra suporte a grupos (`@g.us`)
- **F5-28** — `rpc_get_contact` (4 overloads em `public` + `zapp`) expõe deals/messages/tasks de contatos opted-out — LGPD violation
- **F5-29** — Sem FK/relação `zapp.contacts` ↔ `zapp.empresas` — Etapa 54 (validar FK cascade) é unmeetable
- **F5-30** — `zapp.tags` schema mistura AI tag suggestions com canonical tags — dupla responsabilidade

---

## Bloco 6 — Conexões WhatsApp (etapas 56-65)

Camada de conexões WhatsApp — `whatsapp_connections`, `evolution_instance_credentials`, reconciliação de dispatch, watchdog wpp2 e detecção de 401. 30 achados F6-01 a F6-30 detalhados em `PLANO_IMPLEMENTACAO_100.md` Tema 12. Base factual medida em 02/08/2026 01:25 UTC — resumo: evolution_instance_credentials=1 row unhealthy, whatsapp_connections=3 rows com created_by=NULL em 100%, evolution_reconcile_jobs 373/1663 (22%) com timestamps corrompidos, wpp2_disconnection 17/18 unresolved, evolution_ip_watch=0 rows total.

Achados agrupados abaixo pelos Temas 12 do plano. Cada item referencia a numeração de `PLANO_IMPLEMENTACAO_100.md`; consultar o plano para causa raiz completa, arquivo/linha e correção proposta.

### Conexões WhatsApp (Tema 12)

- **F6-01** (P0) — pairing code (Etapa 58) 100% AUSENTE do código
- **F6-02** (P0) — `handleAddConnection` NÃO chama Evolution `/instance/create` — só INSERT no banco
- **F6-03** (P0) — estado divergente wpp2 entre `zapp.whatsapp_connections` e `evo.evolution_instance_credentials`
- **F6-04** (P0) — 2 fontes de verdade para instância (whatsapp_connections vs evolution_instance_credentials) sem canonical
- **F6-05** (P0) — `fn_reconcile_dispatch` reutiliza `request_id` do net_worker → 373 rows (22%) com applied_at anterior a dispatched_at
- **F6-06** (P0) — `fn_alert_wpp2_disconnection` hardcoded para instance_name='wpp2' — não escala multi-instância
- **F6-07** — `fn_alert_wpp2_disconnection` NÃO é SECURITY DEFINER — inconsistente com pattern das outras funções afins
- **F6-08** (P0) — 17 de 18 alerts `wpp2_disconnection` nunca resolvidos (94% backlog) — alert fatigue
- **F6-09** (P0) — cron `wpp2_disconnection_watchdog` (104) schedule `*/10 6-23 * * *` — 6h gap noturno de detecção (23h→6h)
- **F6-10** — cron `sync-instance-registry-status` (96) perdeu 11% das execuções em 24h (256/288)
- **F6-11** — 6 triggers em `zapp.whatsapp_connections`; 4 são duplicatas divergentes (2 pares)
- **F6-12** — `fn_validate_whatsapp_connection_url` cai para hardcoded default se vault vazio — não fail-secure
- **F6-13** (P0) — `api_url` e `api_key` são NOT NULL sem default — INSERT via `useConnectionsActions.handleAddConnection` faltaria valores
- **F6-14** — Só 1 registro em `evo.evolution_instance_credentials` (wpp2); 2 conexões em `whatsapp_connections` órfãs
- **F6-15** — "WPP Marketing (Cloud API Oficial)" tem `api_type='evolution'` — nome enganoso vs config real
- **F6-16** (P0) — `created_by = NULL` em 3/3 rows de `whatsapp_connections` — ownership perdida
- **F6-17** (P0) — RLS `wconn_insert_auth` policy `WITH CHECK (created_by IS NULL OR created_by = auth.uid())` permite orphan INSERTs
- **F6-18** — Policy `auth_secure_123` (nome de código de teste) em produção
- **F6-19** (P0) — `evo.evolution_ip_watch` = 0 rows total — pipeline VPS→DB de detecção 401 morto
- **F6-20** (P0) — `fn_detect_401_bursts` documenta seu próprio "monitoring gap" no comentário — cega por design atual
- **F6-21** (P0) — 373 reconcile_jobs (22%) com `applied_at < dispatched_at - 1 day` — telemetria corrompida
- **F6-22** — 1389 alertas em `zapp.warroom_alerts` em 7d (863 info + 385 critical + 141 warning) — alert fatigue extrema
- **F6-23** — `evo.evolution_alerts` 269 unresolved backlog — nenhum triage
- **F6-24** — `zapp.instance_registry` tem 22 rows; só 3 provisionadas (14%)
- **F6-25** — `instance_auth_events` últimas 17 rows com `event_type=NULL`, `http_status=NULL`, `success=false` — instrumentação quebrada
- **F6-26** — Test coverage módulo connections: 2 test files para ~30 arquivos (0 tests em componentes)
- **F6-27** (P0) — `useEvolutionAutoSync` faz SELECT sem filtro por workspace/user — cross-tenant leak potencial
- **F6-28** — `handleDelete` engole erro do Evolution API `.catch(log.warn)` — deixa instância órfã lá
- **F6-29** — `handleAddConnection` valida só `name` — permite `phone_number` vazio
- **F6-30** — Múltiplas cópias de tabelas em múltiplos schemas: 13 objetos para 5 nomes distintos

---

## Bloco 7 — Admin e monitoramento (etapas 66-75)

Arquivos auditados linha a linha (24 páginas em `src/pages/admin/`, ~5800 linhas de código):

**Páginas de monitoramento (foco Bloco 7):**
- `AdminWhatsAppLogsPage.tsx` (310 L) — envios/webhooks/erros, últimas 150 entradas.
- `AdminEvoApiHealthPage.tsx` (186 L) — saúde/alertas/DR/canais/histórico, run 50-test suite.
- `AdminAutomationLogsPage.tsx` (325 L) — audit trail de automation rules, filtros por regra/status/jid/data.
- `AdminSecurityLogsPage.tsx` (136 L) — tentativas negadas, mudanças de permissão.
- `AdminFailedAuthMessagesPage.tsx` (217 L) — falhas login com bloqueio, filtro por data.
- `AdminInboxSyncStatusPage.tsx` (312 L) — pipeline FATOR X ↔ Inbox, buckets 5min/1h/24h.
- `AdminBridgeStatusPage.tsx` (168 L) — status Lovable ↔ FATOR X, incidents, auto-refresh.
- `AdminEmailStatusPage.tsx` (343 L) — saúde do email, falhas operacionais, request-id.
- `AdminEmailAuditPage.tsx` (311 L) — auditoria de revalidação, paginação.
- `AdminChannelsPage.tsx` (394 L) — canais de atendimento, sticky agent, routing modes.
- `AdminProvidersPage.tsx` (373 L) — provedores (Evolution/WPPConnect/Baileys), health-check.
- `AdminQueuesPage.tsx` (117 L) — filas, distribuição, membros, canais.
- `AdminAutomationsPage.tsx` (790 L) — regras de automação (config).
- `RateLimitDashboard.tsx` (489 L) — rate limiting, IPs bloqueados/whitelist, alertas.
- `PerformanceDashboard.tsx` (139 L) — Core Web Vitals, budget CI.
- `AuditEvidenceDashboard.tsx` (78 L) — evidências de conformidade.
- `HmacSelfTestPage.tsx` (321 L) — validação HMAC + janela temporal + replay.
- `AdminWhatsAppSecretsCard.tsx` (129 L) + `AdminWhatsAppWebhookVerifyCard.tsx` (202 L) — secrets + handshake.
- `SelfHostedHealthPage.tsx` (165 L) — probes Supabase self-hosted + MCP.
- `AdminOperationsPage.tsx` (70 L), `AdminDevDiagnosticsPage.tsx` (208 L).

**Tabelas auditadas:**
`zapp.provider_message_log`, `zapp.dispatch_error_logs`, `zapp.whatsapp_cloud_webhook_pings`, `zapp.failed_messages`, `zapp.security_audit_logs`, `zapp.security_events`, `zapp.login_attempts`, `zapp.rate_limit_logs`, `zapp.blocked_ips`, `zapp.ip_whitelist`, `zapp.webhook_endpoints`, `zapp.webhook_events`, `zapp.webhook_events_processed`, `zapp.webhook_health_alerts`, `zapp.webhook_health_checks`, `zapp.hmac_selftest_audit`, `zapp.system_health_incidents`, `zapp.email_health_summary`, `zapp.email_revalidation_jobs`, `zapp.provider_configs`, `zapp.automation_executions`, `zapp.audit_logs`, `zapp.warroom_alerts`, `cron.job`, `cron.job_run_details`.

**Views compat mapeadas (padrão do Bloco 6):**
`public.provider_message_log` → `zapp.provider_message_log`;
`public.dispatch_error_logs` → `zapp.dispatch_error_logs`;
`public.security_audit_logs` → `zapp.security_audit_logs`;
`public.failed_messages` → `zapp.failed_messages`;
`public.login_attempts` → `zapp.login_attempts`.

### Base factual do banco (medida em 02/08/2026 02:15 UTC)

| Métrica | Valor |
|---|---|
| `zapp.provider_message_log` total | **0 rows** — nenhuma mensagem logada em produção |
| `zapp.dispatch_error_logs` total | 1 row, latest = **2026-05-04** (~3 meses atrás), tabela morta |
| `zapp.whatsapp_cloud_webhook_pings` total | 173 rows, **0 nas últimas 24h, 0 nos últimos 7d** |
| `zapp.whatsapp_cloud_webhook_pings` latest entry | **2026-05-04 10:30 UTC** (~90 dias sem eventos) |
| `zapp.failed_messages` total | 0 rows |
| `zapp.security_audit_logs` total | **0 rows** — mesma tabela referenciada pela SecurityLogs page |
| `zapp.security_events` total | 0 rows |
| `zapp.login_attempts` total | 2 rows, 6 total_attempts, 0 currently locked |
| `zapp.login_attempts` índices | 4 índices (PK + `idx_login_attempts_locked` + `idx_login_attempts_email_locked` + `login_attempts_email_unique` UNIQUE) — G21 correção mantida |
| `zapp.rate_limit_logs` total | **0 rows** — RateLimitDashboard sempre em zero |
| `zapp.blocked_ips` total | 0 rows |
| `zapp.ip_whitelist` total | 0 rows |
| `zapp.webhook_endpoints` total | **0 rows** — nenhum outbound webhook configurado |
| `zapp.webhook_events` total | 0 rows |
| `zapp.hmac_selftest_audit` total | **0 rows** — self-test HMAC nunca gravou |
| `zapp.system_health_incidents` total | 0 rows |
| `zapp.email_revalidation_jobs` total | 0 rows |
| `zapp.provider_configs` total | 0 rows |
| `zapp.automation_executions` total | **0 rows** — audit trail sempre vazio |
| `zapp.audit_logs` total | 7269 (186 last 24h, 21 actions, 6 entities) — **única tabela de auditoria funcional** |
| `zapp.webhook_health_alerts` total | 734 rows, **724 unresolved (98.6% backlog)**, 20 last 24h |
| `zapp.webhook_health_alerts` breakdown unresolved | 709 `burnin_critical_alert` + 9 `lovable_parity_drift` + 4 `burnin_disconnection` + 2 `backup_sentinel_stale` |
| Título recorrente | `E10-03: N new critical alert(s) during burn-in — 72h counter reset. Investigate before go-live.` |
| Cron jobs ativos | **149 jobs** |
| Cron 213 `media_pipeline_health_check` | **9/21 falhas (42.8%)** — coluna `severity` inexistente + violação `chk_warroom_alert_type` |
| Cron 100 `analytics-log-retention` | **2/2 falhas (100%)** — `function public.dblink(text, text) does not exist` |
| Cron 216 `cleanup-cron-job-logs` | 1/3 falhas (33%) |

### Etapa 66 — JSX literal renderizado como texto

**Descoberta P0**: `PerformanceDashboard.tsx` (linhas ~120-140) renderiza **3× `// @technical` como TEXTO LITERAL** no JSX, não como comentário:

```jsx
<span>Largest Contentful Paint (LCP)</span>
<span className="font-mono">&lt; 2500ms</span> // @technical
...
<span className="font-mono">&lt; 0.100</span> // @technical
...
<span className="font-mono">&lt; 500KB</span> // @technical
```

Em JSX inline (fora de `{ /* */ }`), `//` NÃO é comentário — é texto renderizado no DOM. O usuário vê `< 2500ms // @technical` na tela. → **F7-01** (P0).

**Descoberta P0**: `AdminBridgeStatusPage.tsx` linha ~65 tem mesmo bug:
```jsx
<p className="font-mono text-xs">{lastCheck.toLocaleTimeString()}</p> // @technical
```
Após `</p>` fechar o elemento, `// @technical` aparece como TEXTO LITERAL entre elementos irmãos. → **F7-02** (P0).

**Descoberta P0**: `AdminEmailAuditPage.tsx` linha ~125:
```jsx
<Badge variant="outline" className="font-mono"> // @technical
  Total: {total}
</Badge>
```
`// @technical` está dentro dos **children** do Badge, antes do "Total:" — renderizado no DOM. → **F7-03** (P0).

### Etapa 67 — Latência/uptime hardcoded

**Descoberta P0**: `AdminBridgeStatusPage.tsx` KPI cards mockados:
```jsx
<p className="text-2xl font-black">{lovableDb === true ? '42ms' : '--'}</p>
<p className="text-2xl font-black">99.9%</p>
```
Latência de bridge sempre exibe `'42ms'` (string hardcoded) quando lovableDb está online; NÃO mede nada. Uptime 24h é literal `'99.9%'`. → **F7-04** (P0).

**Descoberta P0**: `AuditEvidenceDashboard.tsx` (78 linhas) é **página inteira MOCK ESTÁTICO**. Array `evidences` hardcoded com 3 entradas, `<Badge>V5.0.0-PROD</Badge>` (versão hardcoded), botão `<button>Ver no Repositório</button>` sem `href` (nunca abre nada). Nenhuma leitura de banco. → **F7-05** (P0).

### Etapa 68 — PerformanceDashboard bugs adicionais

**Descoberta P0**: `PerformanceDashboard.tsx` linha 8: `const [lastUpdate, setLastLastUpdate] = useState(new Date());` — nome do setter tem `Last` duplicado (`setLastLastUpdate`). Typo em código de produção. → **F7-06** (P0).

**Descoberta P0**: Normalização de progress bar hardcoded a 4000 para TODAS as métricas: `Math.min((m.value / 4000) * 100, 100)`.
- CLS (0-1): dá 0.025% (barra invisível)
- TTFB (100-500ms típico): 2-12%
- LCP (~2500ms good): 62%
- INP (200ms good): 5%
Mesma barra representa coisas diferentes; comparação sem sentido. → **F7-07** (P0).

**P1**: `setInterval(update, 2000)` — polling 500x/hora mesmo com aba oculta. Sem `document.visibilityState` check. → **F7-08**.

### Etapa 69 — Rotas inexistentes / navegação quebrada

**Descoberta P0**: `AdminInboxSyncStatusPage.tsx` alert "sem inbound" leva a `<Link to="/admin/webhook-overview">Webhook Overview</Link>`. **Nenhum arquivo `AdminWebhookOverviewPage.tsx` em `src/pages/admin/`** — rota 404. → **F7-09** (P0).

**Descoberta P1**: `AdminEmailStatusPage.tsx` "Ver Auditoria":
```jsx
onClick={() => (window.location.hash = '#admin/email-audit')}
```
Muda `location.hash` mas app usa **react-router-dom com path-based routing** — hash é ignorado, botão não navega. → **F7-30** (P1).

### Etapa 70 — Canais e status hardcoded

**Descoberta P0**: `AdminChannelsPage.tsx` `emptyChannel()` retorna `color: "bg-primary"` (classe Tailwind). Depois no card: `style={{ backgroundColor: ch.color }}`. Resultado: `background-color: bg-primary;` — valor CSS inválido. Canais criados via UI ficam **sem cor de fundo**. → **F7-10** (P0).

**Descoberta P0**: `STATUS_BADGE[ch.status]` sem fallback — se backend adicionar novo status, `statusInfo` retorna `undefined` e `statusInfo.variant` lança `TypeError`. → **F7-19** (P0).

### Etapa 71 — Tabelas vazias com painéis sempre em 0

**Descoberta P0**: `zapp.provider_message_log` = 0 rows. `AdminWhatsAppLogsPage` diz "últimas 150 entradas" mas **tabela COMPLETAMENTE VAZIA**. → **F7-11** (P0).

**Descoberta P0**: `zapp.security_audit_logs` = 0 + `zapp.security_events` = 0. `AdminSecurityLogsPage` KPI "Tentativas Negadas (24h)" mostra `.filter(l => l.status === 'denied').length` — filtra a lista INTEIRA (não corta 24h), e a lista é vazia. Rótulo mente. → **F7-12** (P0).

**Descoberta P0**: `zapp.rate_limit_logs` = 0, `zapp.blocked_ips` = 0, `zapp.ip_whitelist` = 0. `RateLimitDashboard` (489 L) inteiro permanentemente em zero. → **F7-13** (P0).

**Descoberta P1**: `zapp.automation_executions` = 0 rows. `AdminAutomationLogsPage` filtros + tabela sempre vazios. → **F7-20** (P1).

**Descoberta P1**: `zapp.hmac_selftest_audit` = 0 rows. `HmacSelfTestPage` monta `<HmacAuditHistoryPanel>` que consulta essa tabela — sempre vazia. Sem trilha de conformidade. → **F7-18** (P1).

### Etapa 72 — Alert fatigue crítico

**Descoberta P0**: `zapp.webhook_health_alerts` = **734 total, 724 UNRESOLVED (98.6% backlog)**. Título recorrente: `E10-03: N new critical alert(s) during burn-in — 72h counter reset. Investigate before go-live.` — sistema literalmente pede pra não ir a produção, enquanto está em produção. 709/724 são `burnin_critical_alert` do cron 145 (`burnin-monitor`, `*/15`). Nenhuma UI mostra esse backlog. → **F7-14** (P0).

Padrão: 1-2 alertas por hora, contador se reinicia a cada 72h sem ser resolvido — cron gera perpetuamente.

### Etapa 73 — Cron jobs quebrados

**Descoberta P0**: Cron 213 `media_pipeline_health_check` (`0 */4 * * *`) — **9/21 falhas em 7d (42.8%)**. Função `zapp.fn_run_media_health_alert()` faz `INSERT INTO zapp.warroom_alerts` com coluna `severity` que **não existe** e `alert_type='media_pipeline'` que **viola** `chk_warroom_alert_type`. Cascata de fixes incompletos. Health-check do pipeline de mídia morto há semanas. → **F7-15** (P0).

**Descoberta P0**: Cron 100 `analytics-log-retention` (`20 5 * * *`) — **2/2 falhas (100%)**. Erro: `function public.dblink(text, text) does not exist`. Extensão `dblink` NÃO instalada. Tabelas `_analytics.log_events_*` incham indefinidamente. → **F7-16** (P0).

### Etapa 74 — PII em URL

**Descoberta P1**: `AdminInboxSyncStatusPage.tsx`:
```jsx
<Link to={`/?contact=${encodeURIComponent(c.remote_jid)}`}>
```
`remote_jid` (`5541999999999@s.whatsapp.net`) via URL vaza para logs Traefik + Service Worker + `document.referrer`. → **F7-17** (P1).

### Etapa 75 — Interações inseguras/frágeis

**Descoberta P1**: `AdminEvoApiHealthPage.tsx` botão "Run test suite" dispara 50 testes em prod sem AlertDialog. Label "Rodando 50 testes…" hardcoded. → **F7-22** (P1).

**Descoberta P1**: `AdminEvoApiHealthPage.tsx` — variant baseada em `readiness.overall?.includes('🟢')` — se backend trocar emoji, todos os banners viram destructive. → **F7-23** (P1).

**Descoberta P1**: `AdminWhatsAppWebhookVerifyCard.tsx` key React `${p.kind}-${p.created_at}` — duplicáveis. → **F7-24** (P1).

### Etapa 75b — Webhook Cloud API silencioso há 90 dias

**Descoberta P0**: `zapp.whatsapp_cloud_webhook_pings` = 173 rows, **zero nas últimas 24h, zero nos últimos 7 dias**. Última entrada: `2026-05-04 10:30 UTC`. `AdminWhatsAppWebhookVerifyCard` "Recebimento de eventos (últimas 24h)" sempre zero. Sem alertagem sobre condição prolongada. → **F7-25** (P0).

### Análises UX/dead-code

**P0**: `HmacSelfTestPage.tsx` useEffect com dependência `[run]` — se `run` não estiver em `useCallback`, dispara em loop infinito. Risco de DDOS acidental na edge function `webhook-hmac-selftest`. → **F7-21** (P0).

**P0**: `SelfHostedHealthPage.tsx` sem AbortController; erros mantêm results stale. → **F7-31** (P0).

**P1 outros**: `AdminQueuesPage` `NOT_IMPLEMENTED` toast em prod (F7-26); `AdminProvidersPage` promete "health-check 2min" mas `provider_configs` vazia (F7-27); `AdminSecurityLogsPage` comentário `{/* Adicionar mais cards */}` em prod (F7-28); `AdminFailedAuthMessagesPage` sem validação `from > to` (F7-29); `AdminAutomationLogsPage` paginação 0-indexed (F7-32).

---

## Achados do Bloco 7 (32 itens registrados em `PLANO_IMPLEMENTACAO_100.md` Tema 13)

### JSX quebrado — texto literal renderizado

- **F7-01** (P0) — `PerformanceDashboard.tsx`: `// @technical` renderizado como texto em 3 blocos JSX.
- **F7-02** (P0) — `AdminBridgeStatusPage.tsx`: mesmo bug após `</p>`.
- **F7-03** (P0) — `AdminEmailAuditPage.tsx`: mesmo bug dentro de `<Badge>` children.

### Dashboards mock / hardcoded

- **F7-04** (P0) — `AdminBridgeStatusPage.tsx` latência `'42ms'` e uptime `'99.9%'` hardcoded.
- **F7-05** (P0) — `AuditEvidenceDashboard.tsx` página inteira é mock estático.

### PerformanceDashboard

- **F7-06** (P0) — `setLastLastUpdate` (typo com `Last` duplicado).
- **F7-07** (P0) — normalização de progress bar hardcoded a 4000.
- **F7-08** (P1) — polling 500x/h sem `document.visibilityState` check.

### Rotas inexistentes / navegação quebrada

- **F7-09** (P0) — `AdminInboxSyncStatusPage` linka para `/admin/webhook-overview` inexistente.
- **F7-30** (P1) — `AdminEmailStatusPage` usa `location.hash =` em app path-based.

### Estados / configurações inconsistentes

- **F7-10** (P0) — `AdminChannelsPage` cor Tailwind como inline style (background-color inválido).
- **F7-19** (P0) — `STATUS_BADGE[ch.status]` sem fallback (TypeError).

### Tabelas vazias / painéis inúteis

- **F7-11** (P0) — `provider_message_log` = 0 rows.
- **F7-12** (P0) — `security_audit_logs` = 0 rows + rótulo "24h" mente.
- **F7-13** (P0) — `rate_limit_logs`, `blocked_ips`, `ip_whitelist` = 0 todas.
- **F7-18** (P1) — `hmac_selftest_audit` = 0 rows.
- **F7-20** (P1) — `automation_executions` = 0 rows.

### Alert fatigue / infra quebrada

- **F7-14** (P0) — `webhook_health_alerts` 724 unresolved (98.6%).
- **F7-15** (P0) — Cron 213 42.8% falha por schema mismatch.
- **F7-16** (P0) — Cron 100 100% falha por `dblink` não instalada.
- **F7-25** (P0) — Cloud API webhook sem tráfego há 90 dias.

### Segurança secundária / PII

- **F7-17** (P1) — `remote_jid` completo em URL query.

### UX / interações inseguras

- **F7-21** (P0) — `HmacSelfTestPage` useEffect com `[run]` — risco de loop infinito.
- **F7-22** (P1) — "Run test suite" sem confirmação; label hardcoded.
- **F7-23** (P1) — decisão baseada em `overall?.includes('🟢')`.
- **F7-24** (P1) — chave React `${kind}-${created_at}` — duplicáveis.
- **F7-31** (P0) — `SelfHostedHealthPage` sem AbortController.

### Dead code / TODO em produção

- **F7-26** (P1) — `AdminQueuesPage` helper `NOT_IMPLEMENTED`.
- **F7-27** (P1) — `AdminProvidersPage` promete "health-check 2min" mas `provider_configs` vazia.
- **F7-28** (P1) — `AdminSecurityLogsPage` comentário `{/* Adicionar mais cards */}`.
- **F7-29** (P1) — `AdminFailedAuthMessagesPage` sem validação `from > to`.
- **F7-32** (P1) — `AdminAutomationLogsPage` paginação 0-indexed.


---

## Bloco 8 — SLA/BPM (etapas 76-80)

Camada de SLA e BPM — `zapp.conversation_sla`, `zapp.sla_*` (9 tabelas), 41 tabelas `bpm.*`, cron `bpm-check-breached-slas` (198), cron `verify-alert-delivery-10min` (205), cron `evo-peak-hours-sla` (163) e páginas frontend `SLADashboard`, `SLAHistory`, `SLAAlertPreferences`. 15 achados F8-01 a F8-15 detalhados em `PLANO_IMPLEMENTACAO_100.md` Tema 14. Base factual medida em 02/08/2026 ~13:00 UTC — resumo: schema `bpm.*` inteiro morto (41 tabelas com 0 rows, zero funções, zero views); `zapp.conversation_sla` = 0 rows; `zapp.sla_delivery_violations` com 1 row unresolved há 3 meses; cron 198 executa função enxuta `zapp.bpm_check_breached_slas()` (5 linhas) que faz UPDATE em tabela 0-row; cron 163 executa 234× em 7d retornando sempre `NO_PEAK_DATA`; `zapp.queues` = 0 rows; comentário v2 de `rpc_queue_sla_panel` admite: "zapp.contacts.queue_id é NULL::uuid hardcoded => métricas eternamente 0".

### Base factual (medida em 02/08/2026 ~13:00 UTC)

| Métrica | Valor |
|---|---|
| Schema `bpm.*` tabelas base | **41 tabelas, TODAS com 0 rows** — módulo BPM inteiro nunca teve dados |
| Schema `bpm.*` funções + views | **0 funções, 0 views** — código apenas de tabelas |
| `zapp.conversation_sla` total | 0 rows (view `public.conversation_sla` usada por `useSLAMetrics` / `useSLAHistory`) |
| `zapp.sla_alert_preferences` total | **0 rows** — página `SLAAlertPreferences` sempre vazia |
| `zapp.sla_configurations` total | 0 rows |
| `zapp.sla_delivery_rules` total | 2 rows — smoke test com nomes "F4 SLA" e "E2 Race" datadas 2026-05-04 |
| `zapp.sla_delivery_violations` total | 2 rows (smoke test), **1 unresolved há ~3 meses** |
| `zapp.sla_policies` total | 0 rows |
| `zapp.sla_rules` total | 0 rows |
| `zapp.sla_violations` total | 0 rows |
| `zapp.sla_history` total | 0 rows |
| `zapp.queues`, `queue_positions`, `sticky_assignments` | **0 rows todas** — panorama de fila vazio |
| `evo.evolution_health_logs` últimas 1h | 0 rows — cron 163 sempre retorna `NO_PEAK_DATA` |
| Cron 198 `bpm-check-breached-slas` (`*/5`) | 702 execuções em 7d, 100% succeeded, cada uma `UPDATE 0` em `bpm_sla_records` |
| Cron 205 `verify-alert-delivery-10min` (`*/10`) | Filtra `evo.evolution_alerts` por `severity='critical' AND payload ? 'notify_request_id'` — **0 alerts SLA nessa tabela** |
| Cron 163 `evo-peak-hours-sla` (`*/15`) | 234 execuções 7d, **todas retornam `NO_PEAK_DATA`** (dependência morta) |
| Triggers `zapp.bpm_track_sla()` / `bpm_track_sla_on_create()` | **STUBS VAZIOS** (`BEGIN RETURN NEW; END`) |
| Função `zapp.fn_check_all_cards_sla` | Completa (com INSERT em `evolution_alerts`) mas **dead code** — cron 198 chama outra função |
| RLS `bpm.bpm_sla_records` | `auth_full_access USING(true) WITH CHECK(true)` — sem tenant isolation |

### Consumidores frontend SLA

- `src/pages/SLADashboard.tsx` (22 L, wrapper dead code)
- `src/components/queues/SLADashboard.tsx` (349 L, componente real usado pelo router)
- `src/pages/SLAHistory.tsx` (registrado em ViewRouter)
- `src/pages/SLAAlertPreferences.tsx` (215 L, **ÓRFÃ — sem rota em ViewRouter/lazyViews/App**)
- `src/features/sla/hooks/`: `useSLAMetrics`, `useSLAHistory`, `useSLAAlertPreferences`, `useSLAAlerts`, `useSLAAlertHistory`
- `src/hooks/useSLAHistory.ts` (2 L, apenas re-export duplicado)
- Zero uso de `bpm.*` no frontend (só em `types.ts` autogerado)

### Etapa 76 — Página `SLAAlertPreferences` órfã sem rota

**Descoberta P0**: `src/pages/SLAAlertPreferences.tsx` tem 215 linhas de UI completa (configurações de canal in-app/email/webhook, thresholds, quiet hours), mas `grep -r "SLAAlertPreferences" src/` não encontra a página em nenhum `<Route>`, `lazyViews`, `App.tsx` ou `ViewRouter.tsx`. **Página inteira é inalcançável em produção**. Tabela `zapp.sla_alert_preferences` também está com 0 rows. → **F8-01** (P0).

### Etapa 77 — Módulo BPM inteiro morto

**Descoberta P0**: Schema `bpm.*` tem **41 tabelas base** (`bpm_cards`, `bpm_flows`, `bpm_flow_steps`, `bpm_automations`, `bpm_automation_executions`, `bpm_activity_log`, `bpm_card_movements`, `bpm_sla_records`, `bpm_registers`, `bpm_forms` etc), **zero funções**, **zero views**, e **TODAS as 41 tabelas com `n_live_tup=0`**. Módulo BPM inteiro nunca teve dados em produção. → **F8-02** (P0).

**Descoberta P0**: 3+ sistemas SLA paralelos convivendo sem canonical: `bpm.bpm_sla_records` (0 rows), `zapp.conversation_sla` (0 rows), `zapp.sla_delivery_violations` (smoke test), `evo.evolution_alerts` (severity='critical'). Nenhum é fonte de verdade; código de checagem se espalha. → **F8-03** (P0).

**Descoberta P0**: Triggers `zapp.bpm_track_sla()` e `zapp.bpm_track_sla_on_create()` são **STUBS VAZIOS**: corpo apenas `BEGIN RETURN NEW; END`. Não fazem tracking algum. → **F8-04** (P0).

### Etapa 78 — Cron 198 chama função errada

**Descoberta P0**: Cron 198 `bpm-check-breached-slas` (`*/5`) executa `zapp.bpm_check_breached_slas()` que tem apenas 5 linhas de `UPDATE bpm.bpm_sla_records SET is_breached=true WHERE deadline_at < now() AND exited_at IS NULL AND is_breached=false` — tabela zerada, então 100% no-op. A função "real" (completa, com INSERT em `evolution_alerts` + notificação) é `zapp.fn_check_all_cards_sla` — **dead code ativo**, ninguém chama. → **F8-05** (P0).

**Descoberta P0**: RLS de `bpm.bpm_sla_records` = `auth_full_access` com `USING(true) WITH CHECK(true)` — qualquer usuário autenticado pode ler/escrever qualquer row. Sem tenant isolation. → **F8-06** (P0).

### Etapa 79 — Dashboard SLA mostra 100% eternamente

**Descoberta P0**: `useSLAMetrics.ts` tem fallback `overallRate: total > 0 ? (...) : 100` — quando `zapp.conversation_sla` está vazia (o caso hoje), dashboard sempre exibe "SLA 100%". Métrica cosmética que mascara ausência total de dados. → **F8-07** (P0).

**Descoberta P0**: `zapp.queues` = 0 rows → `rpc_queue_sla_panel` sempre retorna vazio. Comentário v2 da função admite: "zapp.contacts.queue_id é NULL::uuid hardcoded na view => métricas eternamente 0". Panorama de fila é impossível de renderizar. → **F8-08** (P0).

**Descoberta P0**: `evo.evolution_health_logs` = 0 rows na última hora → cron 163 `evo-peak-hours-sla` executa 234× em 7d, **todas retornando `NO_PEAK_DATA`**. Dependência de dados morta. → **F8-09** (P0).

### Etapa 80 — Verificação de entrega + higiene

**Descoberta P1**: Cron 205 `verify-alert-delivery-10min` executa `ops.fn_verify_alert_delivery()` que filtra `evo.evolution_alerts WHERE severity='critical' AND payload ? 'notify_request_id'`. **Zero alerts SLA nessa tabela** — o roteiro da etapa 80 tinha premissa falsa: SLA breach nunca chega em `evolution_alerts`. Cron opera em vácuo. → **F8-14** (P1).

**Descoberta P1**: Falta índice parcial em `bpm.bpm_sla_records (deadline_at) WHERE exited_at IS NULL AND is_breached=false` para a query do cron 198. Como tabela tem 0 rows hoje, não pesa; mas se BPM for populado, cron precisa do índice para não fazer seq scan a cada 5min. → **F8-15** (P1).

**Descoberta P1**: `src/pages/SLADashboard.tsx` (22 L) é **dead code** — router importa direto de `@/components/queues/SLADashboard` (349 L). Wrapper obsoleto. → **F8-10** (P1).

**Descoberta P1**: `zapp.sla_alert_preferences` tem policies RLS overlapping: `auth_secure_105` + `users_own_preferences` + `service_full_access`. Dois USING conflitantes para o mesmo `authenticated` role. → **F8-11** (P1).

**Descoberta P1**: `src/hooks/useSLAHistory.ts` (2 L) é apenas re-export de `src/features/sla/hooks/useSLAHistory.ts`. Duplicidade de import path — códigos importam de ambos. → **F8-12** (P1).

**Descoberta P1**: Smoke test data com nomes explícitos "F4 SLA" e "E2 Race" datados 2026-05-04 estão vazando em produção há 3 meses em `zapp.sla_delivery_rules` (2 rows) e `zapp.sla_delivery_violations` (2 rows, 1 unresolved). Falta limpeza pós-teste. → **F8-13** (P1).

---

## Achados do Bloco 8 (15 itens registrados em `PLANO_IMPLEMENTACAO_100.md` Tema 14)

### Página órfã / rotas quebradas

- **F8-01** (P0) — `SLAAlertPreferences.tsx` (215 L) sem `<Route>` — página inalcançável.

### Módulo BPM morto

- **F8-02** (P0) — 41 tabelas `bpm.*` com 0 rows; zero funções; zero views.
- **F8-03** (P0) — 3+ sistemas SLA paralelos sem canonical.
- **F8-04** (P0) — Triggers `bpm_track_sla*` são stubs vazios.

### Cron 198 e função errada

- **F8-05** (P0) — Cron 198 chama `bpm_check_breached_slas` (no-op); `fn_check_all_cards_sla` (completa) é dead code.
- **F8-06** (P0) — RLS `bpm_sla_records` = `USING(true) WITH CHECK(true)`.

### Dashboard eterno em 100%

- **F8-07** (P0) — `useSLAMetrics.overallRate` fallback = 100 quando vazio.
- **F8-08** (P0) — `zapp.queues` = 0 rows → `rpc_queue_sla_panel` sempre vazio.
- **F8-09** (P0) — `evo.evolution_health_logs` = 0 rows → cron 163 sempre `NO_PEAK_DATA`.

### Higiene / dead code / índices

- **F8-10** (P1) — `src/pages/SLADashboard.tsx` (22 L) dead code.
- **F8-11** (P1) — `sla_alert_preferences` policies RLS overlapping.
- **F8-12** (P1) — `src/hooks/useSLAHistory.ts` re-export duplicado.
- **F8-13** (P1) — Smoke test data ("F4 SLA", "E2 Race") em prod há 3 meses.
- **F8-14** (P1) — Cron 205 não cobre alertas SLA — premissa da etapa 80 é falsa.
- **F8-15** (P1) — Falta índice parcial `bpm_sla_records (deadline_at) WHERE exited_at IS NULL AND is_breached=false`.

---

## Retomada — próximo chat

Onde parar de Bloco 8 e o que executar em seguida:

1. **Bloco 9 — Resiliência e edge cases (etapas 81-90):**
   - 81: Rede offline durante envio → Service Worker + `useOnlineStatus`
   - 82: Rede intermitente → retry exponencial supabase-js
   - 83: Supabase down + reconexão → banner + jitter + filas locais
   - 84: Evolution API 401 sustentado → `evo-detect-401-bursts` (173)
   - 85: Fila cheia DLQ → crons `route-failed-webhooks-to-dlq` (87), `dlq-poison-guard` (146), `monitor-dlq-health` (91)
   - 86: Deadman switch → `guardian-heartbeat-sync` (131), `guardian-db-heartbeat-resilient` (193), `check-guardian-alive` (188)
   - 87: Race condition envio simultâneo → `uq_msg_msgid_instance`
   - 88: Idempotência → `webhook_events_processed` (171k linhas)
   - 89: Timeout > 30s → `statement_timeout` PostgREST
   - 90: Circuit breaker → 5 falhas em 10s

2. **Bloco 10:** roteiro completo em `PLANO_QA_ANALISE_100.md` (etapas 91-100: cross-browser, mobile, a11y, PWA offline, Lighthouse).

**Contexto crítico do Bloco 8 para o próximo chat:**
- **9 achados P0** identificados (F8-01, 02, 03, 04, 05, 06, 07, 08, 09).
- **Página órfã (F8-01)**: `SLAAlertPreferences.tsx` (215 L) inteira sem rota — feature 100% inalcançável em prod.
- **BPM inteiro morto (F8-02)**: 41 tabelas `bpm.*` com 0 rows, zero funções, zero views. Módulo BPM nunca teve dados.
- **3+ sistemas SLA paralelos (F8-03)**: `bpm.bpm_sla_records`, `zapp.conversation_sla`, `zapp.sla_delivery_violations`, `evo.evolution_alerts` — nenhum canonical.
- **Triggers stubs (F8-04)**: `bpm_track_sla` e `bpm_track_sla_on_create` são `BEGIN RETURN NEW; END`.
- **Cron 198 no-op (F8-05)**: 702 execuções em 7d, todas UPDATE 0 rows. Função "real" `fn_check_all_cards_sla` é dead code.
- **RLS insegura (F8-06)**: `bpm_sla_records` = `USING(true) WITH CHECK(true)` — sem tenant isolation.
- **Dashboard eterno 100% (F8-07)**: `useSLAMetrics` fallback `overallRate: 100` quando vazio — métrica cosmética que mascara ausência de dados.
- **Panorama de fila impossível (F8-08)**: `zapp.queues` = 0 rows; comentário v2 de `rpc_queue_sla_panel` admite `queue_id NULL::uuid hardcoded => métricas eternamente 0`.
- **Cron 163 `NO_PEAK_DATA` sempre (F8-09)**: `evo.evolution_health_logs` = 0 rows na última hora, 234 execuções em vácuo em 7d.

**P1 relevantes:**
- **F8-14**: Cron 205 `verify-alert-delivery-10min` não cobre alertas SLA — roteiro da etapa 80 tinha premissa falsa.
- **F8-15**: Falta índice parcial em `bpm_sla_records (deadline_at) WHERE exited_at IS NULL AND is_breached=false`.
- **F8-13**: Smoke test data ("F4 SLA", "E2 Race") vazando em prod há 3 meses.

**Documentos ao final desta sessão (8 blocos concluídos):**
- `docs/audits/PLANO_QA_ANALISE_100.md` — roteiro (não alterado).
- `docs/audits/PLANO_IMPLEMENTACAO_100.md` — 170 achados nos Temas 1-14.
- `docs/audits/RELATORIO_EXECUCAO_ANALISE.md` — este documento.

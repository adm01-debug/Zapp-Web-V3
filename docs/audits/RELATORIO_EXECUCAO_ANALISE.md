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
| 7 | Admin e monitoramento (66-75) | ⏸ Pendente | — |
| 8 | SLA/BPM (76-80) | ⏸ Pendente | — |
| 9 | Resiliência e edge cases (81-90) | ⏸ Pendente | — |
| 10 | Cross-browser / a11y / perf (91-100) | ⏸ Pendente | — |

**Achados até aqui: 123 (14 Bloco 1 + 13 Bloco 2 + 12 Bloco 3 + 24 Bloco 4 + 30 Bloco 5 + 30 Bloco 6).**

---

## Bloco 1 — Inventário estrutural (etapas 1-10)

_(Detalhes registrados anteriormente.)_

## Bloco 2 — Auditoria do banco (etapas 11-20)

_(Detalhes registrados anteriormente.)_

## Bloco 3 — Autenticação e sessão (etapas 21-30)

_(Detalhes registrados anteriormente.)_

## Bloco 4 — Inbox e mensageria (etapas 31-45)

_(Detalhes registrados anteriormente. 24 achados F4-01 a F4-24 em `PLANO_IMPLEMENTACAO_100.md` Tema 8.)_

## Bloco 5 — Contatos e CRM (etapas 46-55)

_(Detalhes registrados anteriormente. 30 achados F5-01 a F5-30 em `PLANO_IMPLEMENTACAO_100.md` Tema 11.)_

---

## Bloco 6 — Conexões WhatsApp (etapas 56-65)

Arquivos auditados linha a linha:
- `src/features/connections/index.ts` (barrel).
- `src/features/connections/hooks/useConnectionsManager.ts` (dispatcher central).
- `src/features/connections/hooks/parts/useConnectionsState.ts` (estado local).
- `src/features/connections/hooks/parts/useConnectionsActions.ts` (business logic).
- `src/features/connections/hooks/parts/useConnectionsRealtime.ts` (subscribe).
- `src/features/connections/services/whatsappConnectionService.ts` (3168 B, QR + normalize).
- `src/features/connections/data-access/whatsappConnectionRepository.ts` (repo com columnMap).
- `src/services/connections/connectionsRepository.ts` (4136 B, genericService).
- `src/services/connections/connectionsService.ts` (2978 B, business rules).
- `src/services/connections/useConnectionsQueries.ts` (2806 B, React Query hooks).
- `src/services/connections/useConnectionsMutations.ts` (2091 B).
- `src/services/connections/BridgeService.ts` (1515 B, external Supabase health).
- `src/hooks/useEvolutionAutoSync.ts`, `src/hooks/useEvolutionAutoReconnect.ts`.
- `src/hooks/useEvolutionApi.ts` + `src/hooks/useEvolutionApiManagement.ts` (create/connect/logout/delete).
- `src/integrations/zappweb/evolutionClient.ts` (client HTTP).
- `src/lib/evolutionInstance.ts` (evolutionInstanceName resolver).
- 30 componentes em `src/components/connections/` (ConnectionsView 649 linhas, ConnectionCard 359, InstanceSettingsDialog 496, NumberReputationMonitor 160, QrCodeDialog 214, AddConnectionDialog 144, etc.).
- Pages: `src/pages/admin/Connections.tsx`, `src/pages/admin/connections/{ConnectionsExternalDbTab,ConnectionsMcpTab,ConnectionsWebhooksTab,ConnectionsIntegrationsTab}.tsx`.

Auditoria SQL profunda:
- Tabelas: `evo.evolution_instance_credentials` (17 col, TABLE, 1 row), `zapp.whatsapp_connections` (39 col, TABLE, 3 rows), `zapp.instance_registry` (22 rows), `zapp.qr_attempts` (TABLE, 5 rows), `evo.evolution_reconcile_jobs` (TABLE, 1663 rows), `evo.evolution_alerts` (TABLE), `zapp.instance_auth_events` (TABLE), `evo.evolution_ip_watch` (TABLE, 0 rows).
- Views compat: `public.qr_attempts`, `public.evolution_reconcile_jobs`, `public.evolution_alerts`, `public.evolution_instance_credentials`, `public.instance_auth_events`, `zapp.evolution_reconcile_jobs`, `zapp.evolution_alerts`, `zapp.evolution_instance_credentials`, `zapp.evolution_instances`.
- Funções auditadas: `zapp.fn_reconcile_dispatch`, `zapp.fn_reconcile_apply`, `zapp.fn_alert_wpp2_disconnection`, `zapp.fn_alert_connection_drift`, `zapp.fn_sync_instance_registry_status`, `zapp.fn_connection_drift_summary`, `zapp.fn_mark_qr_attempt_connected`, `zapp.cleanup_old_qr_attempts`, `zapp.fn_register_instance`, `zapp.fn_reprocess_instance_webhook_events`, `zapp.pause_instance`/`unpause_instance`/`is_instance_paused`, `zapp.rpc_instance_stats`/`_auth_event_summary`/`_auth_event_trend`, `zapp.rpc_resolve_instance_by_phone`/`_whatsapp_instance`, `zapp.get_connection_id_for_instance`, `zapp.get_connection_instance`, `evo.fn_bootstrap_wpp2_instance`, `evo.fn_burnin_disconnection_check`, `evo.fn_detect_401_bursts`, `evo.fn_detect_external_401_bursts`, `evo.fn_detect_instance_recreate`, `evo.fn_update_instance_health`, `zapp.fn_validate_whatsapp_connection_url`, `zapp.fn_clear_qr_on_connect`, `zapp.fn_wconn_updated_at`, `zapp.fn_log_whatsapp_connection_state_change`, `zapp.auto_pause_instance_on_auth_spike`, `zapp.cleanup_old_instance_auth_events`.
- Crons auditados: 27 (`whatsapp_reconcile_dispatch`, `*/5`), 30 (`_apply`, `1-59/5`), 32 (`connection_drift_alert`, `4-59/5`), 34 (`evolution-pipeline-health-check-bateria10`), 35 (`evolution-jid-health-check-5min`), 65 (`purge_evolution_alerts`, `0 4 * * *`), 67 (`_reconcile_cleanup`, `17 3 * * *`), 68 (`_reconcile_reaper`, `*/3`), 88 (`archive-old-wpp2-messages`, `0 3 1 * *`), 96 (`sync-instance-registry-status`, `2-59/5`), 101 (`qr-attempts-expire-15min`, `*/15`), 104 (`wpp2_disconnection_watchdog`, `*/10 6-23`), 120 (`wpp2-session-expiry-watchdog`, `*/15`), 137 (`monthly-evo-audit`, `0 6 1 * *`), 138 (`ensure-evolution-backcompat-views`, `0 */6 * * *`), 158-173 (evo-* alerta chain), 182 (`evolution-pipeline-probe-15min`), 185 (`vacuum-instance-credentials-daily`), 189 (`evo_cleanup_expired_contact_ids`), 217 (`expire-whatsapp-media-1h`).

### Base factual do banco (medida em 02/08/2026 01:25 UTC)

| Métrica | Valor |
|---|---|
| `evo.evolution_instance_credentials` total | **1** (só wpp2, health_status='unhealthy', online_instances=0) |
| `zapp.whatsapp_connections` total | **3** (wpp2 connected/ok, wpp_pink_test disconnected/error, wppmkt disconnected/provisioned) |
| `zapp.whatsapp_connections` com `created_by IS NULL` | **3 (100%)** — ownership perdida em todas |
| `zapp.instance_registry` total | 22 (statuses: `archived, connected, not_provisioned`) |
| Discrepância `whatsapp_connections` vs `evolution_instance_credentials` | 2 conexões órfãs (wppmkt, wpp_pink_test) sem credenciais |
| **Estado divergente wpp2** | `whatsapp_connections.health='ok'` **vs** `evolution_instance_credentials.health='unhealthy'` |
| Triggers em `zapp.whatsapp_connections` | **6** (4 são duplicatas em 2 pares divergentes: updated_at × 2, clear_qr × 2) |
| RLS policies em `zapp.whatsapp_connections` | 4 (`auth_secure_123` com nome de teste, `wconn_insert_auth` permite orphan) |
| RLS policies em `evo.evolution_instance_credentials` | 1 (`evo_creds_service_role_only` — só service_role) |
| `zapp.qr_attempts` total | **5** (todos status=`expired`, 2 nas últimas 24h) |
| `evo.evolution_reconcile_jobs` total | 1663 (1663 applied, **8 failed**, 12 last hour) |
| `evo.evolution_reconcile_jobs` com `applied_at < dispatched_at - 1 day` | **373 (22%)** — timestamps corrompidos por reciclagem de request_id |
| `evo.evolution_alerts` unresolved+unacked | **269 backlog** |
| `wpp2_disconnection` alerts total (all-time) | 18 (17 unresolved, 1 acked = 94% backlog) |
| `wpp2_disconnection` alerts últimas 10h | 10 (padrão: 1 alerta a cada ~1h) |
| `zapp.warroom_alerts` últimos 7d | **1389** (863 info, 385 critical, 141 warning) — alert fatigue |
| `evo.evolution_ip_watch` total | **0** — pipeline VPS→DB de detecção 401 morto |
| `zapp.instance_auth_events` últimas 24h | 17 rows, TODAS com `event_type=NULL, http_status=NULL, success=false` |
| Cron 96 `sync-instance-registry-status` execuções últimas 24h | 256/288 esperado (**11% de perda**) |
| Cron 27, 30, 32, 68, 101, 104, 173 últimas 7d | 100% sucesso (mas F6-20 mostra que sucesso não implica detecção real) |
| Múltiplas cópias de tabelas em schemas | qr_attempts (2×), reconcile_jobs (3×), alerts (3×), instance_credentials (3×), auth_events (2×) — **13 objetos, 5 nomes** |
| Test coverage `src/features/connections/` + `src/services/connections/` | 2 test files para ~30 arquivos (0 tests em componentes) |
| Pairing code (Etapa 58) | **0 hits em código** — feature 100% ausente |

### Etapa 56 — Criar instância Evolution

**Descoberta P0**: `handleAddConnection` em `useConnectionsActions.ts` NUNCA chama `useEvolutionApi.createInstance()`. Só faz `safeClient.single('whatsapp_connections', q => q.insert({...}))` com 7 colunas (name, phone_number, instance_id, instance_name, status, is_default, api_type). Depois chama `handleShowQrCode` que dispara `whatsappConnectionService.requestQrCode(evoName)` — mas se a instância nunca foi criada no Evolution API, essa chamada retorna 404. **Fluxo de criação via UI está quebrado desde deploy** — as 3 rows atuais foram criadas por outro caminho (Evolution manager direto? seed migration?). → **F6-02** (P0).

**Descoberta P0**: `zapp.whatsapp_connections.api_url` e `.api_key` são `NOT NULL` sem default. INSERT do `handleAddConnection` faltaria essas colunas — deveria falhar. Que as 3 rows atuais existam prova que insere via outro caminho. → **F6-13** (P0).

**Descoberta P0**: RLS `wconn_insert_auth` policy WITH CHECK `(created_by IS NULL) OR (created_by = auth.uid())` permite orphan INSERTs. Combinado com F6-16 (100% das rows com `created_by=NULL`), sem ownership. → **F6-17** (P0).

**Descoberta P0**: Trigger `trg_validate_whatsapp_connection_url` cai para hardcoded default `'https://evolution.atomicabr.com.br'` se vault estiver vazio — não fail-secure. Mensagem de erro do RAISE expõe URL esperada. → **F6-12**.

Policy `auth_secure_123` — nome de código de teste (`_123` suffix) em produção → **F6-18**.

Múltiplas cópias de tabelas em schemas: `qr_attempts` (2), `reconcile_jobs` (3), `alerts` (3), `instance_credentials` (3), `auth_events` (2) — 13 objetos para 5 nomes distintos → **F6-30**.

`handleAddConnection` valida só `name`, permite `phone_number` vazio → **F6-29**.

### Etapa 57 — QR code

Cron `qr-attempts-expire-15min` (jobid 101) rodou 283x em 7d, mas `zapp.qr_attempts` tem só 5 rows total (todas expired, 2 nas últimas 24h). Cron opera em set trivialmente pequeno. `whatsappConnectionService.detectQrTtlMs` faz clamp entre 15s-300s (default 60s) — parses `count`, `qrcode.count`, `ttl`, `expires_in` — múltiplos fallbacks, resiliente.

`whatsappConnectionService.logQrAttempt` é chamado a cada request — mas só 5 rows históricos sugerem que **fluxo de QR raramente é executado em produção** (wpp2 já está autenticado; wpp_pink_test/wppmkt sem uso ativo).

### Etapa 58 — Pairing code

**Descoberta P0**: pairing code **100% AUSENTE** do código. Grep de `pairing|Pairing|PAIRING|pairing_code|pairingCode` em `src/**` retorna **1 hit** — apenas comentário JSDoc em `useEvolutionApiManagement.ts` linha 296 dizendo `"lifecycle operations: create, connect, reconnect, logout, restart, delete, and QR/pairing-code retrieval"`. Sem implementação. Banco tem 0 funções relacionadas. Feature promised no plano nunca foi implementada. → **F6-01** (P0).

### Etapa 59 — Reconexão automática

Crons `whatsapp_reconcile_dispatch` (27, `*/5`), `_apply` (30, `1-59/5`), `_reaper` (68, `*/3`) — todos ativos, 100% sucesso em 7d (exceto _apply com 1 falha em 850, 0.12%).

**Descoberta P0**: `fn_reconcile_dispatch` chama `net.http_get('/instance/fetchInstances')` e faz `INSERT INTO evolution_reconcile_jobs (request_id) ON CONFLICT (request_id) DO UPDATE SET dispatched_at = now()`. `pg_net` recicla request_ids ao longo do tempo. Quando colide com job antigo, UPDATE só toca dispatched_at, preservando `applied_at` antigo. **373 rows (22%) com `applied_at < dispatched_at - 1 day`**. Sample: id=24041 tem `dispatched_at=2026-08-02 01:15` mas `applied_at=2026-07-28 03:31` (delta=-4d21h). → **F6-05**, **F6-21** (ambas P0).

Métrica de latência de reconcile completamente corrompida.

`useEvolutionAutoReconnect` (frontend) com exponential backoff (2s→60s), MAX_CONSECUTIVE_RECONNECT_ATTEMPTS=20 (adicionado 2026-07-05 para evitar loop infinito), circuit breaker em 401/403. Bem estruturado.

### Etapa 60 — Disconnection alerts

**Descoberta P0**: `fn_alert_wpp2_disconnection` **NÃO é SECURITY DEFINER** (prosecdef=false). Todas as funções afins são SECDEF. → **F6-07**.

**Descoberta P0**: Função hardcoded para `WHERE instance_name = 'wpp2'`. Multi-instância impossível com esse pattern. Também `fn_bootstrap_wpp2_instance`, cron `wpp2_disconnection_watchdog` (104), cron `wpp2-session-expiry-watchdog` (120) — tudo hardcoded. → **F6-06** (P0).

**Descoberta P0**: cron `wpp2_disconnection_watchdog` (104) schedule `*/10 6-23 * * *` — **BUSINESS_HOURS_ONLY**. Gap de 7h (23:00→06:00) sem monitoramento. Disconnection às 03:00 gera alerta só às 06:10. → **F6-09** (P0).

**Descoberta P0**: 17 de 18 alerts `wpp2_disconnection` all-time **nunca resolvidos** (`resolved_at IS NULL`). Últimas 10h: alerta a cada ~1h (08:00, 09:00, 10:00, 11:10, 12:10, 13:20, 14:20, 15:30, 16:30, 17:40). Anti-flood check `resolved_at IS NULL AND created_at > now() - 60 min` funciona (evita spam >1x/h), mas como resolved_at nunca é setado (sem trigger de auto-close quando instância volta), alertas pilham indefinidamente. **94% backlog**. → **F6-08** (P0).

**Descoberta P0**: `zapp.whatsapp_connections.wpp2.status='connected'`, `health_status='ok'` — MAS `evo.evolution_instance_credentials.wpp2.health_status='unhealthy'`, `online_instances=0`. **Duas fontes de verdade, conclusões opostas**. UI mostra "conectado" enquanto Evolution API está degradada. Os 17 alerts corroboram queda real, mas UI está mentindo. → **F6-03**, **F6-04** (ambas P0).

### Etapa 61 — Multi-instância

**Descoberta P0**: `useEvolutionAutoSync` faz `.from('whatsapp_connections').select('instance_id, phone_number')` sem filtro por workspace/user. Se RLS estiver frouxa, retorna instâncias de outros tenants; INSERT de "missing" instances pode atribuir instância de tenant A ao workspace de user B. → **F6-27** (P0).

`fn_alert_wpp2_disconnection` hardcoded (F6-06) já registrado. Todo conceito multi-instância é atualmente teórico — só 1 instância provisionada (wpp2 em `evolution_instance_credentials`).

### Etapa 62 — Logout

**Descoberta**: `useEvolutionApi.disconnectInstance(evoName)` chama edge function `evolution-api` action `disconnect`. Preserva `whatsapp_connections` row com `status='disconnected'`. Trigger `trg_clear_qr_connect` seta `disconnected_at = now()`. OK funcionalmente.

**Descoberta**: 6 triggers em `zapp.whatsapp_connections`; 4 duplicatas em 2 pares divergentes:
- `update_whatsapp_connections_updated_at` + `trg_wconn_updated_at` (mesmo comportamento)
- `clear_qr_on_connect_trigger` (só limpa qr_code) + `trg_clear_qr_connect` (limpa qr_code + qr_code_base64 + seta connected_at/last_connected_at/disconnected_at)

→ **F6-11**.

### Etapa 63 — Delete de instância

**Descoberta**: `handleDelete` em `useConnectionsActions.ts` chama `deleteInstance(evoName).catch((e) => log.warn(...))` — **engole erro do Evolution API**. Se 500, delete no banco continua; instância fica órfã no Evolution manager consumindo recursos, potencialmente ainda recebendo webhooks. → **F6-28**.

Sem purge de R2 mencionado no plano — grep de `r2\|R2\|cascade` em code de handleDelete não retorna nada relacionado.

### Etapa 64 — Instance drift detection

Cron `sync-instance-registry-status` (96, `2-59/5`) rodou 810x em 7d = ~48h esperado × 12/h = 576... na verdade `*/5min = 12/h × 24h × 7d = 2016 esperado`. **256 execuções em últimas 24h** de 288 esperado = 11% de perda. → **F6-10**.

`fn_sync_instance_registry_status` compara `zapp.instance_registry` com `zapp.whatsapp_connections` (não com `evo.evolution_instance_credentials`) — sync baseado em fonte errada (F6-04).

`zapp.instance_registry` tem 22 rows (statuses: archived, connected, not_provisioned) mas só 3 têm entry em `whatsapp_connections` (14% provisionadas). → **F6-24**.

LEFT JOIN `whatsapp_connections wc LEFT JOIN evolution_instance_credentials eic USING (instance_name)` mostra 2 órfãs (wppmkt, wpp_pink_test sem credentials). → **F6-14**.

`WPP Marketing` name diz "Cloud API Oficial" mas `api_type='evolution'` — inconsistência. → **F6-15**.

### Etapa 65 — 401 burst

**Descoberta P0**: `evo.evolution_ip_watch` = **0 rows total** — pipeline VPS→DB de detecção 401 documentado como quebrado no próprio código da função. → **F6-19** (P0).

**Descoberta P0**: `fn_detect_401_bursts` (SECDEF) contém string literal explicando o próprio monitoring gap: `"BLIND: evolution_ip_watch=0 rows — VPS log pipeline (Traefik→DB) not active"`. Insere CHECKLIST de 7 passos dentro do `message` de alertas para operador. Antipattern — documentação misturada com telemetria; polui `warroom_alerts` sem oferecer detecção real. Cron 173 rodou 283x em 7d mas cada run é essencialmente no-op documentado. → **F6-20** (P0).

`zapp.instance_auth_events` últimas 24h: 17 rows, TODAS com `event_type=NULL, http_status=NULL, success=false`. Instrumentação do produtor quebrada — escreve shells sem dados. → **F6-25**.

`zapp.warroom_alerts` últimos 7d: 1389 alertas (863 info + 385 critical + 141 warning) = 55 críticos/dia. Se ninguém age em >99%, sinal:ruído catastrófico. → **F6-22**.

`evo.evolution_alerts` unresolved+unacked = 269. Nenhum triage sistemático. → **F6-23**.

### Análise de test coverage

`find src -path "*connection*" -name "*.test.*"` retorna 2 arquivos:
- `src/hooks/connections/__tests__/useHubTabNavigation.test.tsx`
- `src/features/connections/hooks/parts/__tests__/useConnectionsState.test.ts` (328 linhas)

Zero tests em: `useConnectionsActions`, `useConnectionsRealtime`, `useConnectionsManager`, `whatsappConnectionService`, `whatsappConnectionRepository`, `BridgeService`, **30+ componentes** (ConnectionsView 649L, ConnectionCard 359L, InstanceSettingsDialog 496L). → **F6-26**.

---

## Achados do Bloco 6 (30 itens registrados em `PLANO_IMPLEMENTACAO_100.md` Tema 12)

### Fluxo de criação — arquitetura quebrada

- **F6-01** (P0) — pairing code (Etapa 58) 100% ausente do código.
- **F6-02** (P0) — `handleAddConnection` não chama Evolution `/instance/create`; só INSERT no banco.
- **F6-13** (P0) — `api_url` e `api_key` NOT NULL sem default — INSERT via UI faltaria valores.
- **F6-29** — `handleAddConnection` valida só `name` — permite phone vazio.

### Fontes de verdade divergentes

- **F6-03** (P0) — estado wpp2 divergente entre `whatsapp_connections` (connected/ok) e `evolution_instance_credentials` (unhealthy/0 online).
- **F6-04** (P0) — 2 fontes de verdade para instância sem canonical (3 se contarmos instance_registry).
- **F6-14** — 2 órfãs em `whatsapp_connections` sem row em `evolution_instance_credentials`.
- **F6-15** — "WPP Marketing (Cloud API Oficial)" com api_type='evolution'.
- **F6-24** — `instance_registry` 22 rows, só 3 provisionadas (14%).
- **F6-30** — 13 objetos em múltiplos schemas para 5 nomes distintos.

### Reconciliação e telemetria corrompida

- **F6-05** (P0) — `fn_reconcile_dispatch` reutiliza request_id → 373 rows (22%) com applied_at antes de dispatched_at.
- **F6-21** (P0) — telemetria de latência de reconcile completamente corrompida.
- **F6-10** — cron 96 (`sync-instance-registry-status`) perde 11% de execuções.

### Alertas quebrados / hardcoded

- **F6-06** (P0) — `fn_alert_wpp2_disconnection` hardcoded para 'wpp2' — não escala multi-instância.
- **F6-07** — função NÃO é SECURITY DEFINER (inconsistente).
- **F6-08** (P0) — 17/18 alerts `wpp2_disconnection` nunca resolvidos (94% backlog).
- **F6-09** (P0) — cron 104 schedule `*/10 6-23` — 7h gap noturno.

### Segurança/RLS

- **F6-12** — `fn_validate_whatsapp_connection_url` fallback hardcoded se vault vazio.
- **F6-16** (P0) — `created_by=NULL` em 3/3 rows (ownership perdida).
- **F6-17** (P0) — RLS `wconn_insert_auth` permite orphan INSERTs.
- **F6-18** — policy `auth_secure_123` (nome de teste em produção).
- **F6-27** (P0) — `useEvolutionAutoSync` sem filtro workspace/user (cross-tenant leak potencial).

### Detecção 401 morta

- **F6-19** (P0) — `evo.evolution_ip_watch` = 0 rows total, pipeline VPS→DB morto.
- **F6-20** (P0) — `fn_detect_401_bursts` documenta próprio "monitoring gap" no comentário.
- **F6-25** — `instance_auth_events` 17 rows com todos os campos essenciais NULL.

### Backlog / Alert fatigue

- **F6-22** — 1389 alertas em 7d em `warroom_alerts` (55 críticos/dia).
- **F6-23** — 269 unresolved em `evolution_alerts`.

### Cleanup / higiene

- **F6-11** — 6 triggers, 4 duplicatas em 2 pares divergentes.
- **F6-26** — test coverage: 2 test files para ~30 arquivos.
- **F6-28** — `handleDelete` engole erro Evolution API.

---

## Retomada — próximo chat

Onde parar de Bloco 6 e o que executar em seguida:

1. **Bloco 7 — Admin e monitoramento (etapas 66-75):**
   - Admin webhook overview (`AdminWebhookOverviewPage.tsx`) — cards com total/pending/failed/processed em 1h/24h/7d.
   - Admin webhook events (`AdminWebhookEventsPage.tsx`) — busca por `remoteJid`, paginação virtual em 171k eventos.
   - Admin webhook secret status (`AdminWebhookSecretStatusPage.tsx`) — validar assinatura HMAC, secret rotation.
   - Admin failed messages (`AdminFailedMessagesPage.tsx`) — retry individual/em lote, root cause tag.
   - Admin alert history (`AdminAlertHistoryPage.tsx`) — filtro por severidade, canal (Slack/e-mail/PagerDuty).
   - Admin dispatch errors (`AdminDispatchErrorsHistoryPage.tsx`) — cross-ref com `evo.evolution_alerts`.
   - Admin Evolution API logs (`AdminEvolutionApiLogsPage.tsx`) — filtro por status HTTP (foco 401/429/500).
   - Admin realtime monitor (`AdminRealtimeMonitorPage.tsx`) — canais ativos, mensagens/s, lag WAL sender.
   - Admin telemetria (`AdminTelemetriaPage.tsx`) — SLI/SLO, error budget.
   - Admin search insights (`AdminSearchInsightsPage.tsx`) — termos mais buscados, zero-result queries.

2. **Bloco 8-10:** roteiro completo em `PLANO_QA_ANALISE_100.md`.

**Contexto crítico do Bloco 6 para o próximo chat:**
- 16 achados P0 identificados — priorizar F6-02 (add não cria instância), F6-03 (fontes divergentes), F6-05 (telemetria corrompida), F6-19 (detecção 401 morta), F6-27 (cross-tenant leak potencial) na correção.
- `evo.evolution_instance_credentials` deveria ser fonte canonical mas cron sync usa `whatsapp_connections`; sistema de duas fontes com drift permanente.
- Multi-instância é fantasia com fn_alert_wpp2_disconnection hardcoded, fn_bootstrap_wpp2_instance hardcoded, cron `wpp2_disconnection_watchdog` hardcoded — refactor amplo para escalar.
- Pairing code (Etapa 58) é feature promised mas nunca implementada. Suporte só a QR.
- 401 burst detection é **cegueira documentada**: pipeline VPS→DB morto (0 rows em evolution_ip_watch), função sabe disso e insere CHECKLIST no próprio alerta pedindo pra operador consertar. Detecção real depende de GlitchTip (que já funciona) ou reativação do pipeline.
- Alert fatigue: 1389 alerts em 7d (185/dia), 94% backlog em wpp2_disconnection, 269 unresolved em evolution_alerts. Sinal:ruído colapsou.

**Documentos ao final desta sessão (6 blocos concluídos):**
- `docs/audits/PLANO_QA_ANALISE_100.md` — roteiro (não alterado).
- `docs/audits/PLANO_IMPLEMENTACAO_100.md` — 123 achados nos Temas 1-12.
- `docs/audits/RELATORIO_EXECUCAO_ANALISE.md` — este documento.
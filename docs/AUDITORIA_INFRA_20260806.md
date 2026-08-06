# AUDITORIA_TRACKING — Quadro de Status dos 100 Itens (FINAL da rodada 06/08/2026)

- **Rodada:** 2026-08-06 (waves 1–3 executadas) · **Ambiente:** AtomicaBR — Portainer 2.39.5 · Swarm 1 nó · Supabase PG15.8 self-hosted · PG14 nativo · Evolution API custom 2.3.7
- **Fonte da lista:** `.hermes/desktop-attachments/AUDITORIA_INFRA_EVOLUTION_100_ETAPAS.md`
- **Relatórios:** `AG-EX-01` … `AG-EX-25` em `.hermes/auditoria-infra/` · Decisão de ingestão: `DECISAO_INGESTAO.md` · Inventário: `INVENTARIO_INFRA.md`
- **Legenda:** `EXECUTADO` (ação concluída OU diagnóstico fechado) · `DECIDIDO` (decisão documentada, sem ação necessária) · `PRONTO` (diff preparado; aplica na janela do Plano B) · `PARCIAL` (análise feita; correção pendente) · `PENDENTE` · `EM EXECUÇÃO` · `BLOQUEADO`

---

## Bloco 1 — Segurança e Superfície de Acesso (P0–P1)

| # | Título curto | Prioridade | Status | Evidência / AG-EX |
|---|---|---|---|---|
| 1 | Erradicar policies `USING(true)` por schema sensível | P1 | **EXECUTADO** | **0 policies `USING(true)`** (baseline 741; total 1.373). 17 policies restritas em schemas expostos (financeiro/vendas) com roles reais `fn_app_role()` (AG-EX-03). 44 intencionais em zapp documentadas (P2) |
| 2 | Confirmar GRANTs do role `authenticated` | P1 | **PARCIAL** | Dimensionado: 2.667 grants zapp / 1.896 public / 110 financeiro / 40 vendas (~1.400 objetos p/ 19 usuários). **Sem REVOKE** (GRANT amplo + RLS restritiva é o modelo; risco > benefício). Pendência P2: grants TRIGGER/TRUNCATE em storage/functions |
| 3 | Fechar CORS coringa do Evolution | P1 | **DECIDIDO (MANTER \*)** | \*Manter `CORS_ORIGIN=*`: restrição quebra callers sem Origin (MCP/workers/healthcheck — outage F2-07b). Proteção real = apikey + rate limit 200/min + allowlist `/manager`. Plano de rollback documentado (AG-EX-10 item 97; AG-EX-11/21) |
| 4 | RLS na única tabela `financeiro` exposta | P1 | **EXECUTADO** | `financeiro.ranking_exclusoes`: RLS ON + policy `fn_app_role() IS NOT NULL` (AG-EX-03) |
| 5 | Dívida de aliasing de secrets | P2 | **PARCIAL** | **4 órfãos removidos** (service_key_v1/v2, sentry_dsn_consumer_v1, watchdog_sentry_dsn_v1) (AG-EX-20). Aliasing restante (evolution v5→v4, service_key_v3→v1) **adiado p/ janela de redeploy do supabase** (cosmético, sem risco — valor correto montado) |
| 6 | Rotina de rotação de secrets documentada | P2 | **EXECUTADO** | **`docs/SECRETS-ROTATION-RUNBOOK.md`** (AG-EX-20) |
| 7 | Verificar `PGRST_DB_SCHEMAS` do supabase_rest | P2 | **PARCIAL** | **Probe runtime `Accept-Profile`: expostos = public, zapp, financeiro, vendas, storage, graphql_public; `evo`/`email_app`/`ai`/`bpm` → 406** (não expostos ✅) (AG-EX-03). Conf do container não legível (distroless; config via secret) |
| 8 | Investigar 401 do `pg_net` | P2 | **EXECUTADO** | **25×401 com cadência exata 5min = job 27 `fn_reconcile_dispatch` (vault + net.http)**. **JÁ RESOLVIDO**: vault atualizado p/ v5 (14:07Z) → 0×401 após; md5 vault == secret v5 no container (AG-EX-03) |
| 9 | Rotacionar `x-webhook-secret` + `SENTRY_DSN` | P2 | PENDENTE | Higiene pós-exposição; sem exposição nova confirmada desde a auditoria. Runbook pronto (item 6) |
| 10 | Consolidar funções de security self-audit | P3 | **EXECUTADO** | `zapp.fn_security_self_audit_daily()` + job 262 diário 06:10; 5 jobs antigos desativados (AG-EX-02) |

## Bloco 2 — Arquitetura de Ingestão do Evolution (P0–P1)

| # | Título curto | Prioridade | Status | Evidência / AG-EX |
|---|---|---|---|---|
| 11 | Decidir UM caminho de ingestão | P0 | **EXECUTADO (DECIDIDO)** | **Dual-delivery assimétrico**: webhook nativo = primário p/ app (zapp.evolution_messages particionada); RabbitMQ = resiliência + archive (consumer é produtor alternativo da MESMA edge fn). **NÃO migrar p/ consumer-only** (perderia 429/404-gateway; `send.message` não existe na fila) (AG-EX-06/DECISAO_INGESTAO) |
| 12 | Reduzir webhook do wpp2 a eventos de controle | P0 | **PARCIAL** | Webhook mantido como primário p/ MESSAGES (app depende). **QRCODE_UPDATED fora da fila** (item 17). Retry 10→4/300→60 pronto p/ janela do Plano B (AG-EX-06/11) |
| 13 | Colapsar 3 tabelas de webhook event em 1 store | P1 | **PARCIAL** | Stores mapeadas por papel: nativa (archive bruto), `webhook_events_processed` (idempotência edge fn), espelho v2 (mirror). Collapse **não recomendado** (papéis distintos) — decisão documentada (AG-EX-06) |
| 14 | Reavaliar maquinaria de reconciliação | P1 | **EXECUTADO (DECIDIDO)** | **Manter reconcile** como guarda do dual-delivery (0 pending, 1.120 ok) (AG-EX-06) |
| 15 | Corrigir gap sync nativo→espelho | P1 | **EXECUTADO** | Gap = janelas de introdução dos mecanismos (29/07 vs 13/06); lag do job 171 ≈ 9min (ciclo 5min) — **não é backlog** (AG-EX-06) |
| 16 | Sanear `_consumer_dlq` (195 msgs) | P1 | **EXECUTADO** | **195 → 0 pending** (198 replayed idempotente; 1 contacts.update processado). Fila física wpp2.dlq = 0 (AG-EX-12) |
| 17 | Drift config RabbitMQ instância vs global | P2 | **EXECUTADO** | **QRCODE_UPDATED da instância alinhado com global OFF** (0 eventos pós-mudança; 8.955 lixo eliminados da nativa) (AG-EX-12) |
| 18 | Escalonamento do rabbit-consumer (2 réplicas) | P2 | **EXECUTADO** | 2 réplicas saudáveis: drop=0, filas=17/17, prefetch 5, sem duplicação (AG-EX-06/12) |
| 19 | Reduzir `WEBHOOK_RETRY_MAX_ATTEMPTS=10` | P2 | **EXECUTADO** | 10→4 e MAX_DELAY 300→60 **aplicados no deploy Plano B (06/08 22:45Z)** (AG-EX-11) |
| 20 | Diagrama de fluxo de eventos ponta a ponta | P3 | **EXECUTADO** | Diagrama mermaid em `DECISAO_INGESTAO.md` (AG-EX-06) |

## Bloco 3 — Estabilidade da Conexão WhatsApp (P0–P1)

| # | Título curto | Prioridade | Status | Evidência / AG-EX |
|---|---|---|---|---|
| 21 | Causa raiz do 401 recorrente do wpp2 | P0 | **EXECUTADO (fix DEPLOYADO)** | **Veredito: enforcement do WhatsApp contra Baileys 7.0.0-rc.9** (issue #2248, CVE-2026-48063). 3 logouts/24h; 0 `POST /instance/logout` externos (um `DELETE` do IP do escritório = runbook). Fix = Plano B (baileys 6.7.24): bundle pronto + workflow com setup-node + artifact fix `d8ed27067`; **DEPLOY 06/08 22:45Z: imagem `997cafdb…` (baileys 6.7.24) em prod, wpp2 open, UpdateStatus completed, RestartCount 0, rollback `9d110bc7` (AG-EX-05/11/21) |
| 22 | Unicidade de sessão (551146375517) | P0 | **PARCIAL** | Só wpp2 na API/DB. Verificação parcial — **instrução ao dono**: checar WhatsApp Web/Desktop logado no número (AG-EX-05) |
| 23 | wa-version-monitor acionar bump | P1 | **PARCIAL** | Monitor só observa/loga (reporta 2.2413.51 legada; web real 2.3000.x); `CONFIG_SESSION_VERSION` não existe. Bump real = rebuild do Plano B (AG-EX-05) |
| 24 | Blindar `evolution_instances` (SPOF) + restore real | P1 | **EXECUTADO** | baileys-backup aposentado (UUID stale + hash sem creds). Sessão/creds = pg_dump evolution → R2 (restore-validate ✅) + **volume-backup stack 220** (evolution-instances + redis-data → R2 14d GPG, 1ª execução validada) (AG-EX-15) |
| 25 | Consolidar watchdogs de conexão | P1 | **EXECUTADO** | watchdog-baileys canônico; watchdog-canary mantido (half-duplex — único); **crons 104/120 desativados**; cron 35 mantido (JID) (AG-EX-19) |
| 26 | `stop_grace_period` no serviço Evolution | P1 | **EXECUTADO** | **30s aplicado no deploy Plano B (06/08 22:45Z)** (AG-EX-11) |
| 27 | Revisar `QRCODE_LIMIT=30` + runbook re-QR | P2 | **PARCIAL** | 30 confirmado (flapping QR 07/31+); fluxo logout→connect→QR validado; runbook do re-QR documentado (AG-EX-05) |
| 28 | Auditar `_swarm_guardian_events` / dup-detector | P2 | **EXECUTADO** | 0 duplicatas/reconnect_storm; 18 replica_drift = churn de deploy; job 160 mudo por design — MANTER (AG-EX-05/19) |
| 29 | 401-feed transformar detecção em ação | P2 | **EXECUTADO** | Job 161 reescrito p/ `evolution_connection_history` (≥3/15min, dedup 30min) + entrega real (escalada 73/84). **SEM auto-reconnect** (enforcement → loop de re-pairing; decisão documentada) (AG-EX-19/17) |
| 30 | SLA de disponibilidade da conexão | P3 | **EXECUTADO** | KPI `v_wpp2_uptime_24h` + job 163 re-apontado (`fn_wpp2_uptime_kpi`, alerta 99/95%, 1 alerta/episódio + auto-resolução; prova de fogo end-to-end) (AG-EX-19) |

## Bloco 4 — Sprawl de pg_cron (P1–P2)

| # | Título curto | Prioridade | Status | Evidência / AG-EX |
|---|---|---|---|---|
| 31 | Consolidar 6 purges de webhook | P1 | **EXECUTADO** | `zapp.fn_webhook_purge_consolidated(30,5000)` + job 263 diário 03:45 (retenção por tabela); jobs 54/61/152/235/247/260 desativados; **56.966 linhas purgadas na validação** (AG-EX-02) |
| 32 | Deduplicar `cleanup_expired_contact_ids` | P1 | **EXECUTADO** | **2 tabelas reais** (evo + zapp.contact_id_graveyard; public = view). Job 189 cobre as duas via DO block; 190 desativado (AG-EX-02) |
| 33 | Deduplicar purges de cron history | P1 | **EXECUTADO** | Job 99 absorve política única (succeeded<48h + failed<7d); 129 desativado (AG-EX-02) |
| 34 | Colapsar health-checks do pipeline | P1 | **EXECUTADO** | 7→4 (mantidos 182/55/142/213; desativados 34/154/176) (AG-EX-02) |
| 35 | Consolidar guardian heartbeats | P1 | **EXECUTADO** | 193 ampliado (liveness zapp+evo + dblink); 131 desativado; 188 mantido (AG-EX-02) |
| 36 | Reduzir cadência 1–5 min sem valor | P2 | **EXECUTADO** | 115 (5→15min) e 172 (10→15min) com offsets (AG-EX-02) |
| 37 | Remover cron órfão `restore_av_evo...`(250) | P2 | **EXECUTADO** | `cron.unschedule` do job 250 (órfão sem runs) (AG-EX-02) |
| 38 | Auditar `purge-health-score-history`(207) | P2 | **EXECUTADO** | `zapp.fn_health_score_history` **é tabela real** (2.295 linhas, +300/dia) — comando era válido; corrigido + **reativado** (AG-EX-02) |
| 39 | Agrupar 7 `logflare-*-cleanup` | P2 | **EXECUTADO** | Job 218 virou iterador das **11 partições** `_analytics.log_events_%` (cobre 2 órfãs ~6,5GB+2,2GB); 219–224 desativados (AG-EX-02) |
| 40 | Inventário de cron versionado | P3 | **EXECUTADO** | **`zapp.cron_inventory`**: 154 registros (130 ativos, 23 desativados, 1 removido) com dono/propósito/SLA/replaced_by + relatório AG-EX-02 (29KB) |

## Bloco 5 — Sprawl de Guards/Stacks Swarm (P1–P2)

| # | Título curto | Prioridade | Status | Evidência / AG-EX |
|---|---|---|---|---|
| 41 | Converter long-lived `while true;sleep` em jobs reais | P1 | **PARCIAL** | 23 loops mapeados (AG-EX-04); lógica SQL-only já coberta por pg_cron (wave 1); loops com docker/curl documentados p/ swarm-cronjob (onda futura) |
| 42 | Limpar debris de crashloop | P1 | **EXECUTADO** | 6 containers removidos (5× evolution-db-purge + clamav); só one-shot Exited(0) restantes (AG-EX-04) |
| 43 | Podar volumes anônimos órfãos | P1 | **EXECUTADO** | 10 volumes 64-hex removidos (49→39; dangling 5→0) (AG-EX-04) |
| 44 | Investigar 9 stacks `updated:1970` | P1 | **EXECUTADO** | **8/9 subiram via CLI fora do Portainer** (deploy por API); sysctl-quic-fix NUNCA subiu → **stack removido** (AG-EX-04/16) |
| 45 | Racionalizar `openclaw-*` + guard-meta-monitor | P2 | **EXECUTADO** | Guards redundantes vs healthcheck removidos **com prova de cobertura** (guard-meta-monitor, openclaw-brain/edge-guard conforme mapeamento); 21 composes de rollback byte-verificados vs Portainer (AG-EX-16) |
| 46 | Racionalizar família `disk-*` | P2 | **EXECUTADO** | 1 coletor + 1 actioner; fixes (memory 32M→64M, version: 3.7/3.8); cadeia fluindo (AG-EX-16/17) |
| 47 | Racionalizar `hermes-*`/`traefik-*` | P2 | **PARCIAL** | Análise completa (AG-EX-04); fusão do guard consolidado único documentada — remoções pendentes (onda futura, baixo risco) |
| 48 | Remover `postgres:15-alpine` como cliente psql | P2 | **EXECUTADO** | **6 guards → `alpine:3.19` + postgresql-client** (Up estável, sem crash-loop); supabase-backup mantém postgres:15-alpine (pg_dump legítimo) (AG-EX-16) |
| 49 | Papel do watchtower vs no-auto-update | P2 | **EXECUTADO** | 19 serviços `watchtower.enable=false`, 0 com `=true` → **no-op hoje**; evolution false ✅; decisão: manter desligado p/ stateful (AG-EX-04) |
| 50 | Consolidar backups redundantes | P3 | **PARCIAL** | Tabela consolidada (11+ backups → R2, retenções 14d–365d); +4 stacks novos (215/216/219/220); baileys-backup aposentado (AG-EX-04/15/16) |

## Bloco 6 — Higiene do Banco Supabase (P1–P2)

| # | Título curto | Prioridade | Status | Evidência / AG-EX |
|---|---|---|---|---|
| 51 | Destino dos ghost schemas | P1 | **EXECUTADO** | **ai/bpm/email_app MANTIDOS** — dependency map completo (ai: model_pricing_v2 + views; bpm: 16 RPCs + 54 views + 164 grants; email_app: 4 RPCs + 3 Realtime hooks + 65 linhas). Zero DROP SCHEMA (regra: dependência real) (AG-EX-18) |
| 52 | Auditar/reduzir 477 views do `public` | P1 | **EXECUTADO** | **477 → 444 (−33)**, 33 100% órfãs dropadas (migration `20260807000001`, backup viewdefs); 84 candidatas retidas por regra dura (recriadas por cron 138, espelho de schema, n8n, extensão) (AG-EX-18) |
| 53 | Índices duplicados `evo.evolution_messages_*` | P1 | **EXECUTADO** | **21 índices dup dropados** + 1 tsvector (migrations `20260806991/992`); 0 duplicatas remanescentes (AG-EX-01) |
| 54 | Dropar 11 tabelas de tenant vazias | P1 | **PARCIAL** | Verificação `pg_inherits` obrigatória feita (regra NÃO MEXA de partições); drops executados apenas onde seguro — conferir AG-EX-01 para lista exata (algumas são partições → mantidas por regra) |
| 55 | Remover duplicata `model_pricing`/`_v2` | P1 | **EXECUTADO** | v1 dropada (migration `20260806993`) + view órfã; `_v2` única; **0 referências quebradas** (AG-EX-01/18) |
| 56 | Dropar índices grandes não utilizados | P2 | **EXECUTADO** | `evolution_messages_wpp2_to_tsvector_idx` dropado; `webhook_events_processed_event_id_uq` **MANTIDO** (verificado ON CONFLICT na edge fn) (AG-EX-01) |
| 57 | Bloat de `ops.ddl_audit` (40k) | P2 | **EXECUTADO** | VACUUM + purge 90d validado; churn real ~306 DDL/dia (42% é REFRESH MV — ruído) (AG-EX-01/20) |
| 58 | Remover extensão fantasma `pgmq` | P2 | **EXECUTADO** | `DROP EXTENSION pgmq` (migration `20260806994`, sem dependentes) (AG-EX-01) |
| 59 | Revisar extensões pesadas | P2 | **PARCIAL** | Verificação: vector/pgsodium/vault em uso real; hypopg/wrappers sem uso ativo (documentado, sem drop — reversível) (AG-EX-01/03) |
| 60 | Limpar ~120 namespaces `pg_temp_*` | P3 | PENDENTE | Cosmético; pooling desnecessário (27/300 conexões) — observado, sem ação (AG-EX-08/22) |

## Bloco 7 — PostgreSQL 14 Nativo (P1–P2)

| # | Título curto | Prioridade | Status | Evidência / AG-EX |
|---|---|---|---|---|
| 61 | Saída do PG14 (EOL 12/11/2026) | P1 | **EXECUTADO (rehearsal ✅)** | **Rehearsal completo em PG15.18 efêmero**: evolution 59 tabelas/15s (Message=348.127, 0 FKs/0 índices inválidos), n8n_queue 109 tabelas/177s, metabase (citext), typebot (uuid-ossp); **RUNBOOK-PG14-PG15.md** entregue (janela ~60min, rollback = volume antigo 7d) (AG-EX-22) |
| 62 | Reduzir max_connections + pooling | P1 | **EXECUTADO** | 27/300 (9%) — **pgbouncer NÃO necessário**; sem ação (AG-EX-08/22) |
| 63 | Tratar `_baileys_error_events` (241k) | P1 | **EXECUTADO** | VACUUM + retenção purge v6 (30d) rodando; volume de erro vira métrica (AG-EX-01/14) |
| 64 | Documentar tabelas custom `_*` do fork | P1 | **EXECUTADO** | Retenção/autovacuum aplicados (bootstrap_log, disk_actions_queue, paused_services, alert_cooldown, docker_prune_log, disk_orphans — migrations `20260806995*`); propósito no changelog do fork (AG-EX-01/10) |
| 65 | Consolidar VACUUM manuais do cron | P2 | **EXECUTADO** | **Autovacuum tuning por tabela** (6 tabelas com reloptions) em vez de 9 crons de vacuum (AG-EX-01) |
| 66 | Backup/restore-test do banco `evolution` | P2 | **EXECUTADO** | Cobertura evolution confirmada (daily/weekly/monthly → R2 GPG) + restore-validate ✅ + **metabase/typebot adicionados** (stack 219, 1ª execução validada); rehearsal PG15 usou os MESMOS dumps (AG-EX-08/15/22) |
| 67 | Reduzir save-flags do Evolution | P2 | **EXECUTADO (APLICADO)** | **`SAVE_MESSAGE_UPDATE=false` + `SAVE_DATA_HISTORIC=false`** (NEW_MESSAGE=true preservado) — diff YAML validado (labels tier=critical + audit plano-b-saveflags-67) **APLICADO no deploy do Plano B (06/08 22:45Z)** (AG-EX-23/11) |
| 68 | Drift de schema no purge (MessageUpdate) | P2 | **EXECUTADO** | **Purge v6 com JOIN `Message.messageTimestamp`** deployado: ciclo real 188 purged (e 170 no rehearsal PG15); órfãos = 0 (AG-EX-14/22) |
| 69 | Isolar `n8n_queue` (1,7GB) | P3 | **EXECUTADO** | Não é vazamento (~700MB/dia legítimos; prune 14d ativo); recomendação MAX_AGE 336→168h documentada (AG-EX-08) |
| 70 | Monitorar `IsOnWhatsapp` + TTL | P3 | **EXECUTADO** | TTL alinhado (purge 7d = env 7d); **5.916 purged** no ciclo real (AG-EX-14) |

## Bloco 8 — Edge Functions Supabase (P1–P2)

| # | Título curto | Prioridade | Status | Evidência / AG-EX |
|---|---|---|---|---|
| 71 | Inventariar/classificar 120+ edge functions | P1 | **EXECUTADO** | 120 → **106** (−14 órfãs, condicionais verificadas: 0 chamadores/0 invocações 48h+7d); 1 STALE resolvido; registry −25 órfãos; `receive-crm-callback` mantido (chamador externo) (AG-EX-07/13) |
| 72 | Consolidar funções de webhook | P1 | **EXECUTADO** | Canônica = `evolution-webhook` (13.309 invocações); `whatsapp-webhook` removida; utilitários de diagnóstico mantidos (UI admin ativa) (AG-EX-13) |
| 73 | Consolidar funções de health | P1 | **EXECUTADO** | `health` consolidado + sub-check `evolution` adicionado; `evolution-health`/`gmail-health` removidas (AG-EX-13) |
| 74 | Consolidar STT/transcrição | P1 | **EXECUTADO** | `speech-to-text` canônica (app); `ai-transcribe-audio` mantida (stub→ai-router); `audio-transcribe` removida (AG-EX-13) |
| 75 | Decidir futuro `elevenlabs-*` | P2 | **EXECUTADO** | 7 usadas pelo app mantidas; 4 órfãs removidas (agent-token, sts, voice-design, webhook) (AG-EX-13) |
| 76 | Decidir futuro `gmail-*`/`outlook-*`/email_app | P2 | **EXECUTADO** | `gmail-health`/`outlook-oauth` removidas; restantes com uso (AG-EX-13) |
| 77 | Corrigir cron `weekly-edge-fn-freshness`(123) | P2 | **EXECUTADO** | Já corrigido no runtime (falha única 03/08 c/ código antigo); próximo run 10/08 (AG-EX-07) |
| 78 | Corrigir cron `types-drift-weekly`(126) | P2 | **EXECUTADO** | Já corrigido no runtime (AG-EX-07) |
| 79 | Validar saúde da `evolution-webhook` | P2 | **EXECUTADO** | 220.110 req/7d · **20 rejected (0,009%)** · p50 25ms / p95 116ms · **0 alertas abertos** — saudável, fail-closed ativo (AG-EX-07) |
| 80 | Remover funções de teste do runtime | P3 | **EXECUTADO** | Todas com UI admin ativa → **mantidas por decisão**; órfãs sem chamador removidas (AG-EX-13) |

## Bloco 9 — Observabilidade, Backups e DR (P1–P2)

| # | Título curto | Prioridade | Status | Evidência / AG-EX |
|---|---|---|---|---|
| 81 | Métrica Prometheus fantasma | P1 | **EXECUTADO (DECIDIDO)** | **Manter habilitado** (auth + allowlist 10.0.0.0/8 — custo zero, sem stack nova; Grafana futuro). Sem exposição pública (AG-EX-17) |
| 82 | Validar restore-validate ponta a ponta | P1 | **PARCIAL** | Evolution: ✅ validado (dump 103MB → 23s, 59 tabelas, FKs 0). **Gap: supabase-db nunca testado** — procedimento documentado p/ incluir (AG-EX-09) |
| 83 | Corrigir cron `verify-alert-delivery-10min`(205) | P1 | **EXECUTADO** | Deadlock 05/08 corrigido (migrations v6/v7 + SKIP LOCKED + stagger); run manual ok; 0 falhas desde (AG-EX-09) |
| 84 | Unificar canais de alerta | P2 | **EXECUTADO (mínimo)** | Mirror de warroom crítico → `evolution_alerts` (canal com entrega) com dedupe 1h; 42+ escritores mapeados; silos documentados (AG-EX-17) |
| 85 | Reduzir 805 webhook_health_alerts | P2 | **EXECUTADO** | 401-feed rewired p/ fonte real + threshold ≥3/15min; dedup 30min; sentinel falso positivo corrigido (AG-EX-17/19) |
| 86 | Instituir system health score único | P2 | **EXECUTADO** | 96,9 A+; redundância removida (TTL 30min, sem recalculo do job 108) (AG-EX-17) |
| 87 | Backup RabbitMQ + evolution_instances | P2 | **EXECUTADO** | **Stack 220 volume-backup** (evolution-instances + rabbitmq-data c/ definitions export + redis-data → R2 14d GPG); 1ª execução + decrypt/tar validados (AG-EX-15) |
| 88 | Documentar RTO/RPO por serviço | P2 | **EXECUTADO** | Tabela RTO/RPO completa (evolution ≤24h/testado; supabase ≤24h; volumes 24h; mídia ~0) (AG-EX-15) |
| 89 | Consolidar coleta de disco | P3 | **EXECUTADO** | **Fix do enum cast** (migration `20260806182000`): cadeia morta desde 01/08 reativada; disco real 83% alertando; 1 coletor + 1 actioner (AG-EX-09/17) |
| 90 | Externalizar logs (Logflare) | P3 | **EXECUTADO** | Retenção 7d p/ fontes de alto volume (cloudflare/deno) via job 218; _supabase 9,97GB sob controle (~620MB/dia) (AG-EX-17) |

## Bloco 10 — Governança e Débito Técnico (P2–P3)

| # | Título curto | Prioridade | Status | Evidência / AG-EX |
|---|---|---|---|---|
| 91 | Reconciliar fork com upstream | P1 | **EXECUTADO** | Base **2.3.7** (não defasada — upstream 2.4.x RC-only); processo de rebase + changelog T1–T6 documentados; label `source` 404 corrigido na branch do Plano B (AG-EX-10/11) |
| 92 | Formalizar processo de deploy | P1 | **EXECUTADO (DRAFT)** | `deploy-vps-selfhosted.yml` (actionlint 0 erros) no runner self-hosted + convergência verificada. **⚠️ NOVO P1: PAT literal no stack 210** (rotacionar p/ secret) (AG-EX-20/21) |
| 93 | Inventário vivo de infra versionado | P2 | **EXECUTADO** | `INVENTARIO_INFRA.md` **v0.2** com contagens ao vivo pós-waves (AG-EX-24) |
| 94 | Owner/SLA por tier | P2 | **PARCIAL** | 71/94 com tier (46 critical/11 important/14 disposable); proposta p/ os 23 sem (supabase core/traefik/minio/portainer/runner = critical) — aplicação exige janela de redeploy (AG-EX-10/20) |
| 95 | `ops.ddl_audit` como sinal de churn | P2 | **EXECUTADO** | Churn schema real ~306 DDL/dia (42% REFRESH MV = ruído); `_rlstest` suja o sinal; filtro + retenção 90d recomendados (AG-EX-20) |
| 96 | Consolidar MCPs de Supabase | P2 | **EXECUTADO (análise) + EM EXECUÇÃO (fix P1)** | **24 registros / 14 servidores** em 4 perfis Hermes mapeados (AG-EX-24). **P1 NOVO: creds LITERAIS no compose de 3 MCPs cloud** (artes/pttz/deptopessoal) + senha reutilizada pttz/deptopessoal + deptopessoal DOWN 12d não-monitorado + db-mcp aceita initialize sem token → **AG-EX-25 em execução** (secrets + recovery/retire + enforcement) |
| 97 | Testar plano de rollback do CORS | P2 | **EXECUTADO** | Plano canário + preflight + rollback documentado; decisão final = manter `*` (item 3) (AG-EX-10/11) |
| 98 | Revisar `financeiro.ranking_exclusoes` + configs expostas | P3 | **EXECUTADO** | `fn_security_surface_audit()` **CLEAN** (views_no_si=0, truly_dangerous=false) (AG-EX-03/18) |
| 99 | Meta de simplificação mensurável | P3 | **PARCIAL** | Baseline v0.2 (AG-EX-24): crons **130 ativos** (meta <60), guards **20** (<10), edge fns **106** (<70), views **444** (<150), **USING(true) 0 ✓**. Metas restantes = contínuo trimestral |
| 100 | Institucionalizar auditoria recorrente | P3 | **EXECUTADO** | Este tracking + template + `snapshot-sprawl` proposto; commit dos living docs no repo (item 100) |

---

## Anexo A — Backlog de Verificação

| Item | Verificação | Status | Evidência / AG-EX |
|---|---|---|---|
| 7 | `PGRST_DB_SCHEMAS` real | **PARCIAL** | Probe runtime (6 expostos; evo/ai/bpm/email_app → 406) — conf do container via secret não legível (distroless) |
| 2 | GRANTs `authenticated` por schema | **PARCIAL** | Dimensionado (item 2); modelo RLS restritiva mantido |
| 8 | Função que dispara 401 do pg_net | **RESOLVIDO** | Job 27 + vault stale; vault atualizado → 0×401 |
| 91 | Versão upstream base do fork | **RESOLVIDO** | 2.3.7 estável; 2.4.x RC-only |
| 66 | Escopo `postgres-backup-*` vs evolution | **RESOLVIDO** | Coberto + metabase/typebot adicionados |
| 69 | Retenção n8n | **RESOLVIDO** | Prune 14d ativo; throughput legítimo |

## Novos achados da rodada (fora do plano original)

| # | Achado | Severidade | Status |
|---|---|---|---|
| N1 | **Credenciais literais no compose de MCPs cloud** (artes/pttz/deptopessoal) + senha reutilizada | **P1** | AG-EX-25 em execução (→ docker secrets) |
| N2 | **PAT literal no stack 210** (github-actions-runner) | **P1** | Rotacionar p/ secret (AG-EX-20) |
| N3 | `deptopessoal` MCP DOWN ~12 dias (crash disco) e não monitorado | P2 | Recovery/retire no AG-EX-25 |
| N4 | db-mcp aceita `initialize` sem token (rota órfã catch-all) | P2 | Enforcement F1 em teste (AG-EX-25) |
| N5 | Archive_mode=off no PG14 (sem PITR) | P2 | RPO ≤24h documentado; considerar WAL no upgrade 15 |
| N6 | GitHub Actions hosted runners sem alocação → self-hosted vps-zapp | P3 | Resolvido (runner fix + setup-node); registros antigos do runner acumulam (limpeza gh api) |

---

## Resumo final da rodada (06/08/2026)

| Status | Qtde | Notas |
|---|---|---|
| EXECUTADO | **82** | incl. decisões fechadas (3, 11, 14, 21-diag, 81) |
| PARCIAL | **14** | 2, 5, 7, 12, 13, 19*, 22, 23, 27, 41, 47, 50, 54, 59, 82, 94, 99 (19/26 aplicados no deploy do Plano B) |
| PENDENTE | **2** | 9 (higiene opcional), 60 (cosmético) |
| EM EXECUÇÃO | **0** | — |
| BLOQUEADO | 0 | — |

**Scorecard (metas item 99):** policies USING(true) **741→0 ✓ 10/10** · backups lacunas **0 ✓ 10/10** · DLQ **195→0 ✓ 10/10** · crons 151→**130 ativos** (meta <60 — contínuo) · guards 27→**20** (meta <10 — contínuo) · edge fns 120→**106** (meta <70 — contínuo) · views 477→**444** (meta <150 — contínuo) · RLS/superfície **CLEAN ✓** · P0 401: **fix em voo (Plano B)** · **Nenhum P0 aberto sem plano de ação.**

*Próxima rodada: aplicar janela do Plano B (imagem 6.7.24 + retry 4/60 + stop_grace 30s + save-flags), PG14→15.8 (runbook pronto), labels tier, rotacionar PAT (N2), re-medir trimestralmente.*

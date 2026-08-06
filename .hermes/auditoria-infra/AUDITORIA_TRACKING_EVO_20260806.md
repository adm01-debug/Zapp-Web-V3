# AUDITORIA_TRACKING_EVO_20260806 — Quadro de Status do PLANO 100 ETAPAS (EVO API)

- **Rodada:** 2026-08-06 · **Plano-fonte:** `docs/PLANO_CORRECAO_EVO_API_100_ETAPAS_20260806.md`
- **Onda 1 (execução):** 10 agentes paralelos (E1–E10) — status abaixo conforme evidências disponíveis até 2026-08-06 ~19:05
- **Relatórios:** `.hermes/execucao-evo-20260806/E{1..10}-*.md` · Auditoria-fonte: `.hermes/auditoria-evo-api-20260806/A1..A10-*.md` · Rodada anterior: `.hermes/auditoria-infra/AUDITORIA_TRACKING.md` (78/100 executados)
- **Legenda:** ✅ executado (ação concluída OU verificação fechada) · 🔄 em execução (evidência parcial no worktree/commit) · ⏳ pendente (não iniciado / aguarda relatório)
- **Nota de concorrência:** E1–E5, E7–E9 ainda não publicaram relatório no momento da escrita; etapas desses domínios ficam ⏳ até confirmação pelo orquestrador. Etapas 47/87 🔄 por evidência direta no worktree (E7, não commitado).

---

## SCORECARD ONDA 1 (parcial)

| Status | Qtde |
|---|---|
| ✅ executado | 7 |
| 🔄 em execução | 2 |
| ⏳ pendente | 91 |


### FASE — GOVERNANÇA & REPO (etapas 1–10)

| # | Etapa | Prio | Status | Evidência |
|---|---|---|---|---|
| 1 | Versionar os 3 docs críticos untracked | - | **✅** | E10 (este commit) |
| 2 | Arquivar docs obsoletas do mecanismo runtime | - | **✅** | E10 (este commit) |
| 3 | Criar `AUDITORIA_TRACKING_EVO_20260806.md` | - | **✅** | E10 (este commit) |
| 4 | Sincronizar `infra/evolution/docker-compose.evolution.yml` com o stack 25 real | - | **✅** | E10 (este commit) |
| 5 | Sincronizar artefatos T1–T6 no git | - | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 6 | Corrigir labels da imagem custom | - | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 7 | Corrigir `ARG BASE_IMAGE` (build-arg morto) | - | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 8 | Criar `.dockerignore` em `infra/evolution-api-custom` | - | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 9 | Higiene do repo (lixo de sessões) | - | **✅** | E6 9887358b0: pyc/init_body/init_headers/ptools.json/cf_scan_out removidos; types.ts.new já ausente (evo_exec.json mantido p/ decisão) |
| 10 | Gate de CI anti-`apikey: ***` | - | **✅** | E6 9887358b0: gate anti-*** no ci.yml (job quality) |

### FASE — SEGURANÇA (etapas 11–20)

| # | Etapa | Prio | Status | Evidência |
|---|---|---|---|---|
| 11 | Habilitar RLS nas 5 tabelas `zapp.evolution_*` expostas | P0 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 12 | Corrigir `apikey: ***` literal (3 arquivos + bundle) | P0 | **✅** | E6: 3 arquivos verificados corretos em HEAD (falso positivo de redação de ferramenta) + gate anti-*** |
| 13 | Corrigir 7 policies RLS `USING: true` (permissive) p/ `authenticated` | P1 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 14 | Decisão crowdsec: anexar bouncer OU desativar | P1 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 15 | Mover `CROWDSEC_BOUNCER_API_KEY` para secret Swarm | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 16 | Overlay dedicada `evolution_internal` (Internal=true) | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 17 | Revisar `CORS_ORIGIN=*` (decisão documentada) | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 18 | Verificar `gmaps_scraper` publicando `*:9090->8080` | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 19 | Limpar `.env` da imagem base (valores de exemplo) | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 20 | Verificação pós-hardening | - | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |

### FASE — CORE EVO & BAILEYS (etapas 21–30)

| # | Etapa | Prio | Status | Evidência |
|---|---|---|---|---|
| 21 | Mergear workflow parametrizado (`f2/plano-b-baileys-6724` → main) | P1 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 22 | Executar o Plano B: rebuild com baileys corrigido | P1 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 23 | Publicar GHCR + repin do stack 25 | P1 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 24 | Validar pós-deploy do Plano B | P1 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 25 | Tratar `disconnectionAt` stale | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 26 | Injetar `IMAGE_DIGEST` no stack 25 | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 27 | Rotacionar/remover a chave v4 stale | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 28 | Re-apontar callers com chave stale | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 29 | Tag semântica no GHCR para o digest atual | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 30 | Teste real de restore da sessão | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |

### FASE — CALLERS 401 & INTEGRAÇÕES (etapas 31–40)

| # | Etapa | Prio | Status | Evidência |
|---|---|---|---|---|
| 31 | Corrigir edge fn cloud `evolution-health` (projeto `match`) | P1 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 32 | Ressuscitar job 176 (`fn_v2_pipeline_heartbeat`) | P1 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 33 | Acompanhar episódio de SLA (uptime 24h = 38,62%) | P1 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 34 | Re-apontar `fn_detect_401_bursts` (job 173) para fonte real | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 35 | Investigar gap de 2h20m do watchdog-baileys | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 36 | Corrigir swarm-task-guardian (sem heartbeat desde 02/08) | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 37 | Relogar UI do manager (chave stale no browser) | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 38 | wa-version-monitor: gravar DB + corrigir uptimeMs | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 39 | Higiene de `instance_auth_events` | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 40 | Investigar 22 rejected/24h no webhook | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |

### FASE — SUPABASE PG15 / SCHEMA EVO (etapas 41–50)

| # | Etapa | Prio | Status | Evidência |
|---|---|---|---|---|
| 41 | Triagem/purga do backlog de 600 alertas abertos | P1 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 42 | Corrigir drift do `instance_registry` (job 96) | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 43 | Investigar 572 ciclos connecting/qr_pending/24h do wpp2 | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 44 | Religar ou aposentar `evolution_health_logs` | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 45 | Remover fantasmas do schema evo | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 46 | Rotação/limpeza do Vault | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 47 | Popular `webhook_source` (+`idempotency_key`) no `markEventProcessed` | P2 | **🔄** | E7 em execução: webhook_source em evolution-webhook/index.ts (worktree, não commitado) |
| 48 | Remover funções órfãs do schema evo | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 49 | Unificar overload `fn_log_api_401` (3/4 args) | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 50 | Revisar 9 warnings do advisor em `public` (EXECUTE a authenticated) | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |

### FASE — POSTGRES 14 EVOLUTION (etapas 51–60)

| # | Etapa | Prio | Status | Evidência |
|---|---|---|---|---|
| 51 | Corrigir purge v6 (nome + política) | P1 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 52 | `setval` das sequences fora de sync | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 53 | Single-flight do purge | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 54 | Retomar logging em `_purge_runs` | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 55 | Revogar `CREATE` no schema public p/ `n8n_app` + alinhar grants | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 56 | Avaliar `idx_media_instance` (248 kB) a drop | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 57 | Documentar decisão: `evolution_webhook_events` plana | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 58 | Retenção das tabelas pequenas não cobertas | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 59 | Revisar roles/connlimits | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 60 | Plano de crescimento do banco (713 MB) | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |

### FASE — RABBITMQ & CONSUMER BRIDGE (etapas 61–70)

| # | Etapa | Prio | Status | Evidência |
|---|---|---|---|---|
| 61 | Implementar fix v7 do consumer (perdas 4xx) | P1 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 62 | Deploy do consumer v7 | P1 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 63 | Replay das 4 msgs pending na `_consumer_dlq` | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 64 | Healthcheck + `failure_action: rollback` no consumer | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 65 | Limpar política fantasma `dlq-protect` | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 66 | Recriar binding `wpp2 → wpp2.groups.update` (rk curto) | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 67 | Cobertura do `unroutable.audit` no dlq-alert-guard | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 68 | Persistir stats do consumer em tabela | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 69 | Prova de failover real (2 réplicas) | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 70 | Teste de DR do RabbitMQ | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |

### FASE — STORAGE & MÍDIA (etapas 71–80)

| # | Etapa | Prio | Status | Evidência |
|---|---|---|---|---|
| 71 | Lifecycle/limpeza do R2 (13.572 objetos órfãos ~17 GB) | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 72 | Descomissionar MinIO (stack 19) | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 73 | Dívida ADR-001: produtores gravarem `media_bucket`+`media_path` | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 74 | `classify-sticker`: definir `AI_GATEWAY_KEY` ou desativar | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 75 | Higiene do bucket de produção | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 76 | `audio-memes` com 0 objetos | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 77 | Validar cadeia de backups do DB evolution | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 78 | Auditoria de custo R2 | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 79 | Verificar volume `/var/lib/storage` (storage-api) | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 80 | Documentar topologia de mídia final | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |

### FASE — EDGE FUNCTIONS & WEBHOOK (etapas 81–90)

| # | Etapa | Prio | Status | Evidência |
|---|---|---|---|---|
| 81 | Decisão formal sobre `EVOLUTION_WEBHOOK_ALLOW_SHARED_SECRET` | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 82 | Atualizar documentação de rate limits da edge fn | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 83 | Remover 11 edge fns candidatas a órfãs (wave2 parcial) | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 84 | Avaliar `GROUPS_UPSERT` no webhook wpp2 | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 85 | Monitorar isolates do edge-runtime | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 86 | Investigar 20×401/24h do webhook com `recheck-webhook-signature` | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 87 | Log de sucesso HMAC | P3 | **🔄** | E7 em execução: log de sucesso HMAC rate-limited 1/60s (worktree, não commitado) |
| 88 | Teste de auto-pause end-to-end | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 89 | Dashboard de invocações por edge fn | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 90 | Inventário de donos das 106 edge fns | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |

### FASE — OBSERVABILIDADE & FECHAMENTO (etapas 91–100)

| # | Etapa | Prio | Status | Evidência |
|---|---|---|---|---|
| 91 | Corrigir/confirmar o KPI de uptime (38,62%) | P1 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 92 | Fechar o gap do `image_digest=''` na auditoria A-8 | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 93 | Fonte real de %401 para o KPI | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 94 | Automação de análise do access log do Traefik | P2 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 95 | Monitorar disco do host (83%) | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 96 | Housekeeping: incluir imagens órfãs na janela | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 97 | Validar Sentry ponta a ponta | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 98 | Teste end-to-end da cadeia de alertas | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 99 | Runbook de DR consolidado + teste real agendado | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |
| 100 | Re-auditoria programada (mensal) + fechamento | P3 | **⏳** | Pendente — aguarda relatório E1-E5/E7-E9 ou onda 2 |

---

## PENDÊNCIAS HERDADAS DO TRACKING ANTERIOR (etapa 3 do plano)

| Pendência anterior (AUDITORIA_TRACKING.md) | Etapa no plano atual |
|---|---|
| CORS wildcard (item 3 PARCIAL) | 17 |
| Consumer v7 (item 18) | 61–62 |
| Gap sync nativo→espelho 351k×67k (item 15) | 15 (gap = janelas de introdução; não é backlog — AG-EX-06) |
| wa-version-monitor (item 23) | 38 |
| Unicidade de sessão (item 22) | 30/43 |
| Rotação x-webhook-secret + SENTRY (item 9) | 9/40 |
| Colapsar 3 tabelas de webhook (item 13) | 13 (collapse não recomendado — papéis distintos, AG-EX-06) |

---
*Gerado por E10 (docs/compose) em 2026-08-06 — atualizar a cada onda conforme relatórios E1–E9.*

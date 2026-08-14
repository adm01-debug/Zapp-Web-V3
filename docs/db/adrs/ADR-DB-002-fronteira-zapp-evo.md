> **Estado pós-desacoplamento (2026-08-12):** Análise válida. Fronteira operacional documentada em `docs/BOUNDARY-evolution.md` + `docs/decouple/ADR-009-gateway-pattern.md`. DDL proposto neste ADR permanece pendente para onda futura.

# ADR-DB-002 — Fronteira evo→zapp: monitoria = exceção formal; negócio = correção via views de contrato

**Status:** Aceito · **Data:** 2026-08-06 · **Autor:** AG-02 (Onda 2, D2 — ARQ-05/06 P1) · **Escopo:** somente análise/documentação (NENHUM DDL executado)

## Contexto
- Regra de arquitetura (SCHEMA-CONTRACT): `evo` (integração Evolution) NÃO acessa `zapp` (app) diretamente; contrato = views/RPC.
- Evidência da fase 1: ARQ-06 = 20 fns evo com refs `zapp.` no corpo; ARQ-05 = 1 view (`evo.v_kpi_overview`).
- Direção inversa também é massiva (e legítima por views): 152 fns zapp + 186 views zapp referenciam `evo.*` (e2z_q19/q14).
- 32 FKs diretas zapp→evo (ARQ-07) = exceção documentada em paralelo (D3, AG-03).

## Decisão formal
1. **MONITORIA = EXCEÇÃO FORMAL DOCUMENTADA** (17 fns + `evo.v_kpi_overview`): manter em `evo` acessando tabelas de **ops** residentes em `zapp` (webhook_health_alerts, warroom_alerts, webhook_audit_log, webhook_event_dedup, rate_limit_logs, security_audit_logs, evolution_guardian_heartbeat, evolution_messages, TYPE evolution_pipeline_status). Escrita de **alerta** nessas tabelas = parte da monitoria (não é negócio).
2. **NEGÓCIO = CORRIGIR via views de contrato (leitura) e RPC de contrato (escrita)** — planejado para onda futura; **NENHUM DDL nesta onda**.
3. **NÃO mover funções referenciadas por cron** (simulação C1). **NÃO renomear/remover `v_kpi_overview`** (simulação C2).

## Inventário e classificação (20 fns evo; refs comment-stripped; e2z_q01/q33/q16)
| Função | args | SECDEF | Acessa em zapp (L=leitura, E=escrita) | Cron (jobid, ativo) | Classe |
|---|---|---|---|---|---|
| fn_auto_assign_contact | — | sim | L: whatsapp_connections, client_wallet_rules | — (trigger) | **NEGÓCIO** |
| fn_log_assignment_change | — | sim | E: conversation_events (INSERT) | — (trigger) | **NEGÓCIO** |
| sync_contact_intelligence | — | sim | E: contact_intelligence (DELETE); chama RPC zapp.upsert_contact_intelligence | — (trigger) | **NEGÓCIO** |
| fn_burnin_critical_alert_check | — | sim | E: webhook_health_alerts | via evo.fn_burnin_monitor (sem job) | MONITORIA |
| fn_burnin_disconnection_check | — | sim | E: webhook_health_alerts | via evo.fn_burnin_monitor (sem job) | MONITORIA |
| fn_cache_warmup_after_vacuum | — | sim | L: evolution_messages (view backcompat) | 139 ATIVO | MONITORIA |
| fn_check_guardian_alive | — | sim | L: evolution_guardian_heartbeat (view) | 188 ATIVO | MONITORIA |
| fn_detect_401_bursts | — | sim | L: webhook_health_alerts, webhook_audit_log; E: warroom_alerts ×6 | 173 ATIVO | MONITORIA |
| fn_detect_ack_loss_gap | p_window, p_dlq_threshold | sim | E: webhook_health_alerts | 164 ATIVO | MONITORIA |
| fn_detect_dedup_cap_failures | p_window | sim | E: webhook_health_alerts | 168 ATIVO | MONITORIA |
| fn_detect_external_401_bursts | — | sim | L: rate_limit_logs, security_audit_logs; E: webhook_health_alerts | — (dormante) | MONITORIA |
| fn_detect_spurious_closes | p_window, p_reconnect | sim | E: webhook_health_alerts | 166 ATIVO | MONITORIA |
| fn_detect_swarm_task_duplication | — | sim | E: webhook_health_alerts | 160 ATIVO | MONITORIA |
| fn_feed_401_disconnect_alerts | p_minutes, p_threshold | **não** | E: webhook_health_alerts | 161 ATIVO | MONITORIA |
| fn_flag_poison_messages | — | sim | E: webhook_health_alerts | 146 ATIVO | MONITORIA |
| fn_peak_hours_sla_check | p_window | sim | E: webhook_health_alerts | — (dormante) | MONITORIA |
| fn_pipeline_health_probe | — | sim | L: TYPE zapp.evolution_pipeline_status (não é tabela) | 182 ATIVO | MONITORIA |
| fn_v2_mirror_health | — | sim | L: webhook_audit_log | 154 **INATIVO** | MONITORIA |
| fn_v2_pipeline_heartbeat | — | sim | L: webhook_audit_log | 176 **INATIVO** (+ zapp.fn_cron_guardian) | MONITORIA |
| fn_wpp2_uptime_kpi | p_window, p_instance, p_alert | **não** | E: webhook_health_alerts ×3 | 163 ATIVO | MONITORIA |

## evo.v_kpi_overview (ARQ-05)
- **Consumidores:** 0 em pg_proc (e2z_q07), 0 em cron (e2z_q08), 0 no front/edge (grep src/ e supabase/functions/ — só `types.ts` gerado). n8n não verificável a partir deste PG (caveat).
- **Refs zapp (2 diretas):** `zapp.webhook_audit_log` (CTE audit: latência média/p95/24h) e `zapp.webhook_event_dedup` (subquery `dedup_tracked_rows`). Demais CTEs são evo.* (evolution_pipeline_health_log, evolution_messages, evolution_webhook_dlq, _consumer_dlq, evolution_ip_watch, evo.v_dedup_failures, evo.v_wpp2_uptime_24h).
- **Decisão:** manter (uso interno de monitoria; D-9 já a recriou em 06/08). Se um dia for exposta via PGRST, repontar as 2 refs para `public.webhook_audit_log`/`public.webhook_event_dedup`.

## Views de contrato (to_regclass + pg_get_viewdef, e2z_q09/q24/q30)
- **12/13 cobertas** por views `public.<mesmo_nome>` que fazem `SELECT ... FROM zapp.<tabela>`: webhook_health_alerts, webhook_audit_log, webhook_event_dedup, warroom_alerts, rate_limit_logs, security_audit_logs, conversation_events, client_wallet_rules, whatsapp_connections, evolution_messages, contact_intelligence, evolution_guardian_heartbeat.
- **GAP:** `zapp.evolution_pipeline_status` é **TYPE** (to_regclass NULL, não é relação) → sem view de contrato possível; alternativa futura: tipo próprio em evo ou `text`.

## Simulação de cenários (documentada, justifica NÃO mover)
- **C1 — mover fn de cron quebra o job:** 14 jobs (12 ativos: 139, 146, 160, 161, 163, 164, 166, 168, 173, 182, 188 + inativos 154, 176) têm `command` chamando `evo.<fn>`; mover a fn → `function does not exist` no job_run_details e monitoria silenciosa. **DECISÃO: NÃO mover fns com job (nem as inativas — reativação quebraria).**
- **C2 — renomear/remover view consumida quebra front/n8n pelo nome:** hoje 0 consumidores verificáveis → risco baixo, mas n8n (Postgres nodes) é risco residual não auditável deste PG. **DECISÃO: manter nome e schema; sem view de compat necessária agora; reavaliar se n8n consumir.**
- **C3 — correção de negócio (3 triggers):** sem cron envolvido; alterar exige migration versionada (DROP/CREATE TRIGGER ou ALTER FUNCTION) com janela de escrita em evo.evolution_contacts. **DECISÃO: planejar onda futura, validar pós-deploy.**
- **C4 — repontuar leituras para public.*:** 12/13 alvos têm view de contrato; SECDEFs têm search_path sem `public` → usar qualificação completa (`public.x`). Recompilar fns SECDEF preserva EXECUTE em ALTER FUNCTION REPLACE. **DECISÃO: adiado (sem DDL nesta onda).**

## Recomendações acionáveis por função (sem executar)
1. **fn_auto_assign_contact:** repontar leituras para `public.whatsapp_connections` + `public.client_wallet_rules` (existem) ou mover trigger fn para schema zapp.
2. **fn_log_assignment_change:** escrita em `zapp.conversation_events` não pode ir via view (public.conversation_events é SELECT-only) → mover trigger fn para zapp ou criar RPC zapp e chamar via PERFORM.
3. **sync_contact_intelligence:** já usa o RPC de contrato `zapp.upsert_contact_intelligence(p_contact_id uuid)` (padrão correto); corrigir apenas o `DELETE FROM zapp.contact_intelligence` (soft-delete) → RPC zapp dedicado; revisar search_path SECDEF `zapp, evo`.
4. **Monitoria (17):** manter (exceção formal). Pontos: (a) 12 com job ativo — não mover; (b) fn_burnin_* só via evo.fn_burnin_monitor e fn_detect_external_401_bursts/fn_peak_hours_sla_check **sem agendamento** — decidir agendar ou arquivar; (c) 154/176 inativos — reativar aponta para evo (ok); (d) futuro opcional: migrar stack de monitoria para `ops.*` (schema ops já hospeda alert_cooldown, uptime_log, wal_alert_state, v_health_deadman).
5. **v_kpi_overview:** manter; repontar refs se exposta via PGRST.

## Rastreabilidade
ARQ-05 (1 view) e ARQ-06 (20 fns) da fase 1 (phase-01-arquitetura-schema) · D2 do PLANO_RUMO_10_10_SIMULACOES · Evidência bruta: `onda2/e2z_q*.json` (24 queries read-only via MCP fallback HTTP).

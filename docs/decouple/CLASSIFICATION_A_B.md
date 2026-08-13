# Classificação das tabelas evo — A (Evolution owns) / B (Zapp owns)

**Política:** `evo` pertence ao evolution-stack. Zapp lê livremente. Zapp NÃO grava em Grupo A.
Grupo B = Zapp grava hoje. Meta: migrar para `zapp` schema via SET SCHEMA (ver PREFLIGHT_CHECKLIST.md).

**Medido em:** 2026-08-13 · Supabase self-hosted produção

---

## Grupo A — Evolution-stack owns (Zapp read-only)
*Tabelas que o evolution-stack, consumer.py, ou infra de VPS escrevem.
Zapp nunca deve ter grants INSERT/UPDATE/DELETE aqui.*

| Tabela | Linhas | FK ent. | Trig. | Views ext. | Motivo |
|---|---|---|---|---|---|
| evolution_rabbit_consumer_stats | 0 | 0 | 0 | 9 | consumer.py escreve |
| evolution_rabbit_consumer_stats_fdw | — | — | — | — | foreign table pg14 |
| evolution_webhook_events_v2 + 13 partições | 44.8k | 0 | 0 | 28 | raw events do provider |
| evolution_traefik_401_stats | 78.5k | 0 | 0 | 7 | telemetria de borda |
| evolution_connection_history | 10.4k | 0 | 1 | 20 | estado de sessão Baileys |
| evolution_guardian_heartbeat | 4k | 0 | 0 | 10 | watchdog write |
| evolution_bootstrap_log | 174 | 0 | 0 | 18 | bootstrap Evolution |
| evolution_burnin_tracker | 1 | 0 | 0 | 10 | burn-in Evolution |
| evolution_license_health_log | — | 0 | 0 | 0 | licença Evolution |
| evolution_pipeline_health_log | 5.9k | 0 | 0 | 43 | pipeline Evolution |
| evolution_pipeline_history | 1 | 0 | 0 | 14 | pipeline Evolution |
| evolution_reconcile_jobs | 1.8k | 0 | 0 | 16 | reconciliação infra |
| evolution_reconcile_health_log | 390 | 0 | 0 | 9 | reconciliação infra |
| e2e_probe_results | 955 | 0 | 0 | 0 | probes de infra |
| idx_usage_audit | 845 | 0 | 0 | 0 | auditoria de índices DB |
| migration_watermark | 1 | 0 | 0 | 3 | watermark de migração |
| lid_phone_map | 8.8k | 0 | 3 | 0 | protocolo LID/Baileys |
| contact_identity | 16.6k | 0 | 0 | 0 | identidade LID/Baileys |
| lid_convergence_history | 168 | 0 | 0 | 0 | convergência LID |
| contact_id_graveyard | 125 | 0 | 0 | 0 | ⚠️ COLISÃO com zapp.contact_id_graveyard |
| vps_scenario_status | 89 | 0 | 2 | 0 | ops VPS |
| vps_comments | 21 | 0 | 0 | 0 | ops VPS |
| vps_diagnostic_runs | 14 | 0 | 0 | 0 | ops VPS |
| vps_etapas | 10 | 1 | 0 | 0 | ops VPS |
| ops_runbooks | 4 | 0 | 0 | 0 | runbooks infra |
| media_loss_registry | 43.6k | 0 | 0 | 0 | pipeline de mídia infra |
| media_orphan_triage | 15.7k | 0 | 0 | 0 | pipeline de mídia infra |
| media_scan_log | 12.8k | 0 | 0 | 9 | pipeline de mídia infra |
| media_dedupe_log | 7k | 0 | 0 | 0 | pipeline de mídia infra |
| media_cleanup_log | 6.1k | 0 | 0 | 0 | pipeline de mídia infra |
| media_storage_config | 1 | 0 | 1 | 0 | config infra de mídia |
| evolution_whatsapp_check_queue | 15.2k | 0 | 0 | 6 | check de números infra |
| active_messages | — | 0 | 0 | — | view de ingestão |
| active_webhook_events | — | 0 | 0 | — | view de eventos brutos |
| ingest_ledger | 8.7k | 0 | 0 | 13 | ledger de idempotência ingestão |

---

## Grupo B — Zapp owns (migrar para schema `zapp`)
*Tabelas de domínio do Zapp: CRM, conversação, automação, integrações.
O Zapp as escreve hoje. Meta: mover para schema `zapp` via SET SCHEMA.*

**Prioridade de migração = fk_entrantes DESC, rows DESC.**

| Tabela | Linhas | FK ent. | Trig. | Views ext. | Tamanho | Prioridade |
|---|---|---|---|---|---|---|
| **evolution_contacts** | 21.8k | **53** | 24 | 265 | 46 MB | 🔴 ÚLTIMO (mais dependências) |
| evolution_messages (particionada) | 273k | 5 | 4 | 198 | — | 🟠 Alta |
| evolution_messages_wpp2 | 273k | 5 | 11 | 84 | 337 MB | 🟠 Alta |
| evolution_messages_default | 0 | 5 | 5 | 83 | — | 🟠 Alta |
| evolution_whatsapp_status | 16.1k | 1 | 0 | 45 | 18 MB | 🟡 Média |
| evolution_notifications | 8.7k | 1 | 0 | 30 | 3 MB | 🟡 Média |
| media_security_config | 47 | 1 | 0 | 10 | — | 🟡 Média |
| evolution_deals | 9 | 0 | 5 | 86 | — | 🟢 Alta (CRM) |
| evolution_conversations (particionada) | 15.6k | 0 | 0 | 111 | — | 🟢 Alta |
| evolution_conversations_wpp2 | 15.5k | 0 | 2 | 58 | — | 🟢 Alta |
| evolution_alerts | 1.1k | 0 | 3 | 67 | — | 🟢 Alta (Zapp escreve) |
| evolution_media | 17.6k | 0 | 1 | 46 | 19 MB | 🟢 Alta (CRM) |
| evolution_tasks | 6 | 0 | 1 | 64 | — | 🟢 Alta (CRM) |
| evolution_message_queue | 0 | 0 | 0 | 62 | — | 🟢 Alta |
| evolution_daily_metrics | 1 | 0 | 0 | 60 | — | 🟢 Alta |
| evolution_followups | 0 | 0 | 0 | 38 | — | 🟡 Média |
| evolution_followup_rules | 4 | 0 | 1 | 28 | — | 🟡 Média |
| evolution_retry_metrics | 3.3k | 0 | 0 | 22 | — | 🟡 Média |
| evolution_notification_config | 0 | 0 | 1 | 32 | — | 🟡 Média |
| evolution_webhook_dlq | 8 | 0 | 0 | 58 | — | 🟡 Média |
| evolution_bitrix_queue | 0 | 0 | 0 | 26 | — | 🟡 Média (Bitrix = Zapp) |
| evolution_audit_log | 3.9k | 0 | 0 | 36 | — | 🟡 Média |
| evolution_realtime_events | 1.5k | 0 | 0 | 39 | — | 🟡 Média |
| evolution_groups | 221 | 0 | 1 | 20 | — | 🟡 Média |
| evolution_group_participants | 10.7k | 0 | 0 | 16 | — | 🟡 Média |
| evolution_reactions | 199 | 0 | 0 | 23 | — | 🟡 Média |
| evolution_tags + assignments | 24/0 | 0 | 0 | 26/17 | — | 🔵 Baixa |
| evolution_labels + associations | 9/0 | 0 | 1/0 | 22/20 | — | 🔵 Baixa |
| evolution_quick_replies | 13 | 0 | 0 | 16 | — | 🔵 Baixa |
| evolution_business_hours + holidays | 7/11 | 0 | 0 | 14 | — | 🔵 Baixa |
| evolution_settings | 43 | 0 | 1 | 20 | — | 🔵 Baixa |
| evolution_sales_pipeline | 0 | 0 | 1 | 26 | — | 🔵 Baixa (CRM) |
| evolution_stage_mapping | 14 | 0 | 0 | 27 | — | 🔵 Baixa (CRM) |
| evolution_scheduled_messages | 0 | 0 | 0 | 24 | — | 🔵 Baixa |
| evolution_send_idempotency | 0 | 0 | 0 | 16 | — | 🔵 Baixa |
| evolution_keyword_automations | 0 | 0 | 1 | 36 | — | 🔵 Baixa |
| evolution_automation_logs | 0 | 0 | 0 | 16 | — | 🔵 Baixa |
| evolution_chatbot_responses | 3 | 0 | 0 | 16 | — | 🔵 Baixa |
| evolution_spam_keywords | 5 | 0 | 0 | 16 | — | 🔵 Baixa |
| evolution_sentiment_analysis | 0 | 0 | 0 | 32 | — | 🔵 Baixa |
| evolution_instance_credentials | 1 | 0 | 1 | 40 | — | 🔵 Baixa |
| evolution_api_consumers | 6 | 0 | 0 | 26 | — | 🔵 Baixa |
| evolution_ip_blocklist | 0 | 0 | 0 | 18 | — | 🔵 Baixa |
| evolution_contact_rate_limits | 0 | 0 | 1 | 14 | — | 🔵 Baixa |
| evolution_notification_log | 51 | 0 | 0 | 22 | — | 🔵 Baixa |
| evolution_notification_outbox | 0 | 0 | 0 | 9 | — | 🔵 Baixa |
| evolution_mirror_batches/runs/checkpoints/media | 0 | 0 | 0/0/1/1 | — | — | 🔵 Baixa |
| evolution_fallback_events | 0 | 0 | 0 | 18 | — | 🔵 Baixa |
| evolution_status_reactions | 0 | 0 | 0 | 27 | — | 🔵 Baixa |
| evolution_source_schema_map | 0 | 0 | 0 | 30 | — | 🔵 Baixa |
| evolution_messages_wpp2_archive | 64 | 0 | 0 | 82 | — | 🔵 Baixa |

---

## Resumo

| Grupo | Tabelas | Escritas pelo Zapp hoje |
|---|---|---|
| A — Evolution owns | ~34 tabelas | 0 (meta atual) |
| B — Zapp owns | ~91 tabelas | 39 (baseline gate) |
| **Total evo (sem backups)** | **125** | **39** |

**Ordem de execução de SET SCHEMA:** de baixo pra cima na tabela do Grupo B.
`evolution_contacts` é o ÚLTIMO (53 FKs, 24 triggers, 265 views dependentes).

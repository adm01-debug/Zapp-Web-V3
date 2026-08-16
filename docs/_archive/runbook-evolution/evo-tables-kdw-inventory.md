# Inventário K/D/W — schema `evo` (C-8)

- **Fonte**: `db/evo_tables_census.txt` (censo 2026-08-05, coluna `n_live_tup` via pg_stat_user_tables)
- **Escopo**: 130 tabelas do schema `evo` presentes no censo + Apêndice A (tabelas com policy RLS que NÃO constam no censo)
- **Contexto de decisão**: instância única `wpp2`; partições por departamento e mensais de webhook; backups `_*_backup_*` sob investigação (D-1); duplicidades C-7
- **Legenda**:
  - **K** = Keep — operacional/infra/sensível (NÃO tocar; backup em uso NÃO é lixo)
  - **D** = Drop — fantasma (partição vazia) — DETACH + DROP
  - **W** = Watch — feature futura/ociosa ou duplicidade em aberto (manter até ativação/consolidação)

## Resumo

| Classe | Qtd | Critério |
|---|---|---|
| **K** | 84 | operacional, infra, sensível, partição com dados, partição default/mãe, futuras por cron |
| **D** | 22 | partições vazias: 9 `evolution_messages_*`, 10 `evolution_conversations_*`, 3 `evolution_webhook_events_v2_*` |
| **W** | 24 | features ociosas/duplicidades C-7 |
| **Total** | 130 | |

---

## K — Keep (84)

| # | Tabela | Linhas | Justificativa |
|---|---|---|---|
| 1 | evolution_messages_wpp2 | 64485 | Núcleo operacional — mensagens da instância única wpp2 |
| 2 | evolution_webhook_events_v2_2026_07 | 46158 | Partição mensal com dados (retenção ativa) |
| 3 | evolution_media | 38054 | Mídia operacional |
| 4 | _evolution_contacts_backup_20260801 | 20944 | **NÃO dropar** — backup SENDO LIDO em produção (seq_scan 139); aguardar D-1 (mapear consumidor) |
| 5 | evolution_contacts | 20595 | Núcleo de contatos (RLS por admin/supervisor/assigned_to) |
| 6 | _backup_evolution_contacts_20260802 | 20446 | **NÃO dropar** — backup SENDO LIDO em produção (seq_scan 137); aguardar D-1 |
| 7 | evolution_whatsapp_status | 14789 | Status WhatsApp em uso |
| 8 | evolution_conversations_wpp2 | 12869 | Núcleo de conversas da instância wpp2 |
| 9 | evolution_notifications | 8664 | Notificações ativas (canônica vs notification_log — C-7) |
| 10 | evolution_connection_history | 6681 | Histórico de conexão (diagnóstico) |
| 11 | evolution_pipeline_health_log | 4918 | Saúde do pipeline (monitor) |
| 12 | evolution_retry_metrics | 3314 | Métricas de retry |
| 13 | evolution_guardian_heartbeat | 2222 | Heartbeat do guardian (monitor) |
| 14 | evolution_webhook_events_v2_2026_08 | 2122 | Partição mensal com dados |
| 15 | evolution_reconcile_jobs | 1298 | Jobs de reconciliação ativos (B-8: policy SELECT a restringir) |
| 16 | _backup_evolution_alerts_20260802 | 998 | Backup em uso — aguardar D-1 antes de qualquer ação |
| 17 | idx_usage_audit | 845 | Infra — auditoria de índices (manter; SELECT authenticated é intencional) |
| 18 | vps_performance_snapshots | 612 | Dashboard VPS (B-8: intencional) |
| 19 | evolution_alerts | 506 | Alertas ativos (SELECT restrito a admin/supervisor) |
| 20 | evolution_audit_log | 407 | Auditoria (gate workspace_members) |
| 21 | evolution_realtime_events | 304 | Eventos realtime |
| 22 | evolution_bootstrap_log | 135 | Log de bootstrap (srvc_only) |
| 23 | vps_scenario_status | 89 | Dashboard VPS — **B-8: policy UPDATE permissiva a corrigir** |
| 24 | vps_scenarios | 89 | Dashboard VPS |
| 25 | vps_status_history | 72 | Dashboard VPS |
| 26 | evolution_messages_wpp2_archive | 64 | Arquivo de mensagens (retenção) |
| 27 | evolution_settings | 43 | Settings (srvc_only) |
| 28 | evolution_reactions | 32 | Reações em mensagens |
| 29 | mv_daily_metrics | 32 | Materialized view (K — refresh por cron) |
| 30 | mv_vps_category_breakdown | 25 | Materialized view (K) |
| 31 | evolution_groups | 25 | Grupos em uso |
| 32 | evolution_tags | 24 | Tags |
| 33 | vps_comments | 21 | Dashboard VPS — comentários |
| 34 | evolution_calls | 20 | Chamadas |
| 35 | evolution_stage_mapping | 14 | Mapeamento de stages |
| 36 | vps_diagnostic_runs | 14 | Dashboard VPS — diagnósticos |
| 37 | evolution_quick_replies | 13 | Respostas rápidas |
| 38 | evolution_holidays | 11 | Feriados |
| 39 | evolution_bitrix_field_mapping | 11 | Integração Bitrix ativa |
| 40 | evolution_performance_metrics | 11 | Métricas de performance |
| 41 | mv_vps_risk_dashboard | 10 | Materialized view (K) |
| 42 | vps_etapas | 10 | Dashboard VPS |
| 43 | evolution_incident_runbook | 10 | Runbook de incidentes (srvc_only) |
| 44 | evolution_deals | 9 | Deals ativos |
| 45 | evolution_labels | 9 | Labels — catálogo não sensível (B-8: SELECT true intencional) |
| 46 | evolution_business_hours | 7 | Horário comercial |
| 47 | evolution_tasks | 6 | Tasks |
| 48 | evolution_api_consumers | 6 | Consumidores de API (srvc_only) |
| 49 | evolution_messages_comercial_03 | 5 | Partição com 5 linhas (dado de teste) — manter; revisitar em C-2 |
| 50 | evolution_spam_keywords | 5 | Palavras-chave de spam |
| 51 | evolution_followup_rules | 4 | Regras de followup (feature em configuração) |
| 52 | ops_runbooks | 4 | Runbooks de ops (srvc_only) |
| 53 | evolution_logpatch_audit | 4 | Auditoria logpatch |
| 54 | evolution_conversations_default | 3 | **Partição DEFAULT — fallback de roteamento, NUNCA dropar** |
| 55 | evolution_conversations_comercial_03 | 3 | Partição com dados |
| 56 | evolution_chatbot_responses | 3 | Respostas de chatbot |
| 57 | evolution_monthly_audit_log | 2 | Auditoria mensal |
| 58 | evolution_burnin_tracker | 1 | Tracker de burn-in (srvc_only) |
| 59 | evolution_conversations_comercial_01 | 1 | 1 linha residual (não é vazia) — revisar em C-2 antes de qualquer decisão |
| 60 | evolution_pipeline_history | 1 | Histórico do pipeline |
| 61 | evolution_webhook_events_v2_2026_06 | 1 | Partição com 1 linha — manter (C-12 só se aplica a 03/04/05, vazias) |
| 62 | evolution_health_logs | 1 | Health logs |
| 63 | _snapshot_version_state | 1 | Estado de versionamento (internal_access_only) |
| 64 | migration_watermark | 1 | Infra — marca d'água de migrações (B-8: SELECT true intencional, 1 linha não sensível) |
| 65 | evolution_backfill_audit | 1 | Auditoria de backfill |
| 66 | evolution_retention_log | 1 | Log de retenção |
| 67 | _secure_config | 1 | **SENSÍVEL** (configuração/credenciais) — srvc_only, manter |
| 68 | evolution_daily_metrics | 1 | Métricas diárias |
| 69 | evolution_instance_credentials | 0 | **SENSÍVEL** (credenciais de instância) — 0 linhas mas manter com RLS restrita (srvc_only) |
| 70 | evolution_webhook_events_v2 | 0 | **TABELA MÃE particionada — manter** |
| 71 | evolution_webhook_events_v2_default | 0 | Partição fallback — manter |
| 72 | evolution_webhook_events_v2_2026_09 | 0 | Partição FUTURA — criada por cron `evo.fn_auto_create_next_partitions`; **NÃO dropar** |
| 73 | evolution_webhook_events_v2_2026_10 | 0 | idem (futura por cron) |
| 74 | evolution_webhook_events_v2_2026_11 | 0 | idem |
| 75 | evolution_webhook_events_v2_2026_12 | 0 | idem |
| 76 | evolution_webhook_events_v2_2027_01 | 0 | idem |
| 77 | evolution_webhook_events_v2_2027_02 | 0 | idem |
| 78 | evolution_webhook_events_v2_2027_03 | 0 | idem |
| 79 | evolution_webhook_events_v2_2027_04 | 0 | idem |
| 80 | evolution_webhook_events_v2_2027_05 | 0 | idem |
| 81 | evolution_webhook_events_v2_2027_06 | 0 | idem |
| 82 | evolution_ip_watch | 0 | Monitor de IP (defensivo, srvc_only) |
| 83 | evolution_ip_blocklist | 0 | Blacklist de IP (defensivo, srvc_only) — distinta das blacklists de contato |
| 84 | contact_id_graveyard | 0 | Graveyard de IDs de contato (infra, internal_access_only) |

---

## D — Drop (22) — DETACH + DROP (C-2/C-12)

> **Pré-condição obrigatória antes de executar**: revalidar `n_live_tup = 0` (ou `count(*) = 0`) e confirmar ausência de FKs apontando para a partição. Executar em janela de manutenção, dentro de transação, 1 partição por vez.

### D.1 — Partições `evolution_messages_*` (mãe: `evo.evolution_messages`) — 9

```sql
ALTER TABLE evo.evolution_messages DETACH PARTITION evo.evolution_messages_comercial_09; DROP TABLE evo.evolution_messages_comercial_09;
ALTER TABLE evo.evolution_messages DETACH PARTITION evo.evolution_messages_comercial_10; DROP TABLE evo.evolution_messages_comercial_10;
ALTER TABLE evo.evolution_messages DETACH PARTITION evo.evolution_messages_comercial_11; DROP TABLE evo.evolution_messages_comercial_11;
ALTER TABLE evo.evolution_messages DETACH PARTITION evo.evolution_messages_comercial_12; DROP TABLE evo.evolution_messages_comercial_12;
ALTER TABLE evo.evolution_messages DETACH PARTITION evo.evolution_messages_comercial_13; DROP TABLE evo.evolution_messages_comercial_13;
ALTER TABLE evo.evolution_messages DETACH PARTITION evo.evolution_messages_comercial_14; DROP TABLE evo.evolution_messages_comercial_14;
ALTER TABLE evo.evolution_messages DETACH PARTITION evo.evolution_messages_comercial_15; DROP TABLE evo.evolution_messages_comercial_15;
ALTER TABLE evo.evolution_messages DETACH PARTITION evo.evolution_messages_artes;     DROP TABLE evo.evolution_messages_artes;
ALTER TABLE evo.evolution_messages DETACH PARTITION evo.evolution_messages_gravacao;  DROP TABLE evo.evolution_messages_gravacao;
```

### D.2 — Partições `evolution_conversations_*` (mãe: `evo.evolution_conversations`) — 10

```sql
ALTER TABLE evo.evolution_conversations DETACH PARTITION evo.evolution_conversations_comercial_08; DROP TABLE evo.evolution_conversations_comercial_08;
ALTER TABLE evo.evolution_conversations DETACH PARTITION evo.evolution_conversations_comercial_09; DROP TABLE evo.evolution_conversations_comercial_09;
ALTER TABLE evo.evolution_conversations DETACH PARTITION evo.evolution_conversations_comercial_10; DROP TABLE evo.evolution_conversations_comercial_10;
ALTER TABLE evo.evolution_conversations DETACH PARTITION evo.evolution_conversations_comercial_11; DROP TABLE evo.evolution_conversations_comercial_11;
ALTER TABLE evo.evolution_conversations DETACH PARTITION evo.evolution_conversations_comercial_12; DROP TABLE evo.evolution_conversations_comercial_12;
ALTER TABLE evo.evolution_conversations DETACH PARTITION evo.evolution_conversations_comercial_13; DROP TABLE evo.evolution_conversations_comercial_13;
ALTER TABLE evo.evolution_conversations DETACH PARTITION evo.evolution_conversations_comercial_14; DROP TABLE evo.evolution_conversations_comercial_14;
ALTER TABLE evo.evolution_conversations DETACH PARTITION evo.evolution_conversations_comercial_15; DROP TABLE evo.evolution_conversations_comercial_15;
ALTER TABLE evo.evolution_conversations DETACH PARTITION evo.evolution_conversations_artes;     DROP TABLE evo.evolution_conversations_artes;
ALTER TABLE evo.evolution_conversations DETACH PARTITION evo.evolution_conversations_gravacao;  DROP TABLE evo.evolution_conversations_gravacao;
```

### D.3 — Partições mensais passadas VAZIAS de webhook (mãe: `evo.evolution_webhook_events_v2`) — 3 (C-12)

```sql
ALTER TABLE evo.evolution_webhook_events_v2 DETACH PARTITION evo.evolution_webhook_events_v2_2026_03; DROP TABLE evo.evolution_webhook_events_v2_2026_03;
ALTER TABLE evo.evolution_webhook_events_v2 DETACH PARTITION evo.evolution_webhook_events_v2_2026_04; DROP TABLE evo.evolution_webhook_events_v2_2026_04;
ALTER TABLE evo.evolution_webhook_events_v2 DETACH PARTITION evo.evolution_webhook_events_v2_2026_05; DROP TABLE evo.evolution_webhook_events_v2_2026_05;
```

> **NÃO dropar**: `..._2026_06` (1 linha), `..._2026_07` (46158), `..._2026_08` (2122) — têm dados; `..._2026_09` a `..._2027_06` — futuras criadas por cron; `..._default` — fallback; a mãe.

> **Fallback** (se a partição for herança à moda antiga, não declarativa): `DROP TABLE evo.<particao>;` após validar 0 linhas — DETACH não se aplica a herança.

---

## W — Watch (24)

| # | Tabela | Linhas | Condição de ativação / ação |
|---|---|---|---|
| 1 | evolution_status_reactions | 0 | Ativa se reações em status forem habilitadas (status já tem 14.789 linhas) |
| 2 | evolution_status_auto_rules | 0 | Ativa se regras automáticas de status forem ligadas |
| 3 | evolution_group_participants | 0 | Grupos ativos (25) mas participantes nunca sincronizados — ativa com sync de grupos |
| 4 | evolution_group_messages | 0 | idem — ativa com feature de mensagens de grupo |
| 5 | evolution_group_rules | 0 | idem — ativa com regras de grupo |
| 6 | evolution_group_stats | 0 | idem — ativa com estatísticas de grupo |
| 7 | evolution_followups | 0 | `evolution_followup_rules` tem 4 regras mas nenhum followup gerado — ativa quando o agendador rodar |
| 8 | evolution_campaigns | 0 | Feature campanhas sem uso — ativa se campanhas forem implementadas no app |
| 9 | evolution_campaign_recipients | 0 | idem |
| 10 | evolution_broadcasts | 0 | idem (broadcast) |
| 11 | evolution_notification_config | 0 | Notificações ativas (8.664) mas config nunca usada — ativa se o app adotar config |
| 12 | evolution_notification_log | 0 | **Duplicidade C-7** vs `evolution_notifications` (8.664) — definir canônica no código e dropar a outra |
| 13 | evolution_automations | 0 | Feature automações sem uso |
| 14 | evolution_automation_logs | 0 | idem |
| 15 | evolution_baileys_session_history | 0 | Histórico de sessão Baileys — ativa com debug de sessão |
| 16 | evolution_bitrix_queue | 0 | Bitrix ativo (field_mapping=11) mas fila nunca usada — ativa se fila for adotada |
| 17 | evolution_bitrix_sync | 0 | idem |
| 18 | evolution_blacklist | 0 | **Duplicidade C-7** vs `evolution_contact_blacklist` — definir canônica e dropar a outra |
| 19 | evolution_contact_blacklist | 0 | idem |
| 20 | evolution_contact_attachments | 0 | Anexos de contato — ativa se feature for usada |
| 21 | evolution_contact_notes | 0 | Notas de contato — ativa se feature for usada |
| 22 | evolution_contact_rate_limits | 0 | Rate limit de contatos — ativa se for implementado |
| 23 | evolution_ef_logs | 0 | Logs de edge functions — ativa se logging for adotado |
| 24 | evolution_keyword_automations | 0 | Automação por palavra-chave — ativa se feature for ligada |

---

## Apêndice A — Tabelas com policy RLS mas FORA do censo (contagem via query própria)

Estas tabelas existem (policies confirmadas em `pg_policy`) mas não aparecem no censo — classificação preliminar, validar `n_live_tup` antes de agir:

| Tabela | Classe | Justificativa |
|---|---|---|
| evolution_dlq | **K** | DLQ — **vazia = pipeline saudável, NÃO é lixo**; manter (policy SELECT workspace_members) |
| evolution_webhook_dlq | **K** | idem (2ª DLQ) |
| evolution_fallback_events | **K** | Eventos fallback de webhook (SELECT admin/supervisor) |
| evolution_alert_cooldown | **K** | Cooldown de alertas (service_role) |
| evolution_send_idempotency | **K** | Idempotência de envio |
| evolution_source_schema_map | **K** | Mapa de schema fonte |
| evolution_webhook_metrics | **K** | Métricas de webhook |
| evolution_label_associations | **K** | Associações label-chat (complementa evolution_labels) |
| evolution_mirror_batches | **D (condicional)** | Família mirror — contexto C-7: 4 tabelas mortas; confirmar 0 linhas + nenhum consumidor antes do DROP |
| evolution_mirror_checkpoints | **D (condicional)** | idem |
| evolution_mirror_media_queue | **D (condicional)** | idem |
| evolution_mirror_runs | **D (condicional)** | idem |
| evolution_message_queue | **W** | Fila de mensagens ociosa |
| evolution_message_templates | **W** | Templates sem uso (C-7: campaigns/broadcasts/templates sem uso) |
| evolution_template_usage | **W** | idem |
| evolution_scheduled_messages | **W** | Mensagens agendadas ociosa |
| evolution_sales_pipeline | **W** | Pipeline de vendas ocioso (gate workspace_members ALL) |
| evolution_sentiment_alerts | **W** | Sentiment ocioso |
| evolution_sentiment_analysis | **W** | idem |
| evolution_sentiment_metrics | **W** | idem |
| evolution_tag_assignments | **W** | Atribuições de tag ociosa |
| evolution_typebot_sessions | **W** | Sessões Typebot ociosa |

---

## Notas de execução

1. **Ordem de execução**: D.1 → D.2 → D.3 (partições), sempre revalidando 0 linhas imediatamente antes.
2. **Backups (`_*_backup_*`)**: NÃO tocar — D-1 pendente (mapear consumidor dos seq_scans 139/137/… antes de qualquer drop).
3. **Duplicidades C-7 a resolver antes de dropar**: `notification_log` vs `notifications`; `blacklist` vs `contact_blacklist`; família `mirror_*`.
4. **Não dropar nunca**: tabelas mãe (`evolution_messages`, `evolution_conversations`, `evolution_webhook_events_v2`), partições `*_default`, partições futuras por cron, `evolution_instance_credentials`, `_secure_config`.
5. **B-8 (policies)**: ver `db/fix-b8-vps-policy.sql`.

## C-7 ATUALIZAÇÃO (execução 2026-08-05)
Duplicidades NÃO dropadas — classificação final W (watch), com justificativa:
- evolution_blacklist (0) vs evolution_contact_blacklist (0): 28/24 dependentes (RLS+idx), nenhum escritor no código do app (grep src/ supabase/functions = 0 hits). Decisão: canônica = evolution_contact_blacklist (mais específica); dropar evolution_blacklist apenas após remover policies no código.
- evolution_notification_log (0) vs evolution_notifications (8664): 34/45 dependentes. Canônica = evolution_notifications (tem dados); notification_log é resquício. Dropar após mapear escritor (nenhum hit no repo).
- evolution_dlq / evolution_webhook_dlq: K (manter) — vazias = pipeline saudável.
- evolution_ip_blocklist (0): K (defensivo, distinto).
Ação recomendada: ticket de código para remover policies/refs das tabelas órfãs e só então DROP. Impacto de espaço: desprezível (~100KB total).

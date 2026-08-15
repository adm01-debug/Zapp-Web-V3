# EVO_MIGRATION_SPLIT — Inventário de migrations que tocam o schema `evo` (E40)

> Documento de inventário documental (read-only) para o desacoplamento do schema `evo`.
> Gerado em 2026-08-15 — fonte: `supabase/migrations/*.sql` (worktree `chat-fase3`).

## 1. Metodologia

**Regex usada** (grep -E, case-sensitive, linha a linha):

```bash
grep -lE '(CREATE|ALTER|DROP|GRANT|REVOKE|COMMENT ON).*\bevo\.' supabase/migrations/*.sql
```

**Contagem:** `wc -l` da lista = **62 arquivos** (de 285 migrations no diretório).

**Classificação:**
- **(a) DDL estrutura** — cria/altera/drop de TABELAS, FUNÇÕES, ÍNDICES, TRIGGERS, SEQUENCES, TYPES, CONSTRAINTS, COLUNAS, partições/FDW em `evo` (mudança de forma/estado do schema).
- **(b) DDL contrato** — apenas VIEWS, GRANTS/REVOKES, POLICIES (RLS) e COMMENTS (documentação de contrato) em `evo`; nenhuma mudança estrutural.
- Arquivos com ambos (estrutura + contrato) são classificados como **(a)** e marcados como `DDL estrutura + contrato` na coluna Tipo.

## 2. Resumo

| Classificação | Quantidade | % |
|---|---|---|
| (a) DDL estrutura | 50 | 81% |
| (b) DDL contrato | 12 | 19% |
| **Total** | **62** | 100% |

## 3. Tabela completa

| # | Migration | Linhas evo | Class. | Tipo | O que toca em `evo` |
|---|---|---|---|---|---|
| 1 | `20260804000000_canonical_schema_squash_133_migrations.sql` | 86 | a | DDL estrutura + contrato | CREATE TABLE, ALTER TABLE, DROP TABLE, ALTER FUNCTION, CREATE INDEX, DROP INDEX, DROP CONSTRAINT, COMMENT ON, CREATE POLICY POLICY, DROP POLICY POLICY, CREATE  FUNCTION — `evo.evolution_daily_metrics`, `evo.evolution_reactions`, `evo.evolution_calls`, `evo.evolution_followups`, `evo.evolution_webhook_events_v2_default`, `evo.evolution_bitrix_queue`, `evo.evolution_ip_watch`, `evo.evolution_instance_credentials`, `evo.evolution_health_logs`, `evo.evolution_incident_runbook` (+38 outros) |
| 2 | `20260804170000_fix_rls_systematic_coverage.sql` | 2 | a | DDL estrutura | ALTER TABLE —  |
| 3 | `20260805104000_harden_evo_insert_policies.sql` | 4 | b | DDL contrato | DROP POLICY POLICY, CREATE POLICY POLICY — `evo.evolution_media`, `evo.evolution_messages_wpp2` |
| 4 | `20260805104043_harden_evo_insert_policies.sql` | 4 | b | DDL contrato | DROP POLICY POLICY, CREATE POLICY POLICY — `evo.evolution_media`, `evo.evolution_messages_wpp2` |
| 5 | `20260805121000_wave2_perf_security.sql` | 1 | a | DDL estrutura | CREATE  FUNCTION — `evo.fn_create_monthly_partition` |
| 6 | `20260806122000_db03_register_instance.sql` | 26 | a | DDL estrutura + contrato | CREATE TABLE, ALTER TABLE, CREATE INDEX, CREATE POLICY POLICY — `evo.evolution_messages`, `evo.evolution_conversations`, `evo.evolution_webhook_events` |
| 7 | `20260806125000_fix_evo_percent_format.sql` | 2 | a | DDL estrutura | CREATE  FUNCTION — `evo.fn_detect_spurious_closes`, `evo.fn_peak_hours_sla_check` |
| 8 | `20260806141000_f2_31_sync_messages_v2_orderby.sql` | 1 | a | DDL estrutura | CREATE  FUNCTION — `evo.fn_sync_messages_to_v2` |
| 9 | `20260806170500_rb2_c4_drop_empty_evo_indexes.sql` | 12 | a | DDL estrutura | DROP INDEX — `evo.evolution_conversations_artes_remote_jid_idx`, `evo.evolution_conversations_artes_contact_id_idx`, `evo.idx_evolution_ef_logs_ef_created`, `evo.idx_evolution_ef_logs_level_created`, `evo.idx_evo_ip_blocklist_active`, `evo.idx_evo_ip_watch_ts`, `evo.idx_label_assoc_active`, `evo.idx_label_assoc_remote_jid`, `evo.idx_notif_log_status`, `evo.idx_evolution_notification_log_alert_id` (+2 outros) |
| 10 | `20260806172000_rb2_a4_fix_lid_contamination_format.sql` | 1 | a | DDL estrutura | CREATE  FUNCTION — `evo.fn_monitor_lid_contamination` |
| 11 | `20260806173001_rb2_a8_logpatch_patch_mode.sql` | 10 | a | DDL estrutura + contrato | ALTER TABLE, COMMENT ON, CREATE  VIEW  VIEW — `evo.evolution_logpatch_audit`, `evo.v_logpatch_health` |
| 12 | `20260806180001_fix_v_logpatch_health_security_invoker.sql` | 2 | b | DDL contrato | COMMENT ON, CREATE  VIEW  VIEW — `evo.v_logpatch_health` |
| 13 | `20260806185000_rb2_onda3_views_drops.sql` | 14 | a | DDL estrutura + contrato | DROP TABLE, COMMENT ON, ALTER VIEW VIEW, CREATE  VIEW  VIEW — `evo.evolution_baileys_session_history`, `evo.evolution_contact_attachments`, `evo.evolution_contact_blacklist`, `evo.evolution_group_stats`, `evo.evolution_sentiment_alerts`, `evo.evolution_sentiment_metrics`, `evo.evolution_status_auto_rules`, `evo.evolution_typebot_sessions`, `evo.v_health_unified`, `evo.v_kpi_overview` |
| 14 | `20260806185500_rb2_d9_kpi_overview.sql` | 3 | b | DDL contrato | COMMENT ON, ALTER VIEW VIEW, CREATE  VIEW  VIEW — `evo.v_kpi_overview` |
| 15 | `20260806190500_rb2_glitchtip_cleanup.sql` | 1 | a | DDL estrutura | ALTER FUNCTION — `evo.fn_get_401_glitchtip_payload` |
| 16 | `20260806800002_seed_evo_instance_credentials_wpp2.sql` | 1 | b | DDL contrato | COMMENT ON — `evo.evolution_instance_credentials` |
| 17 | `20260806991000_drop_duplicate_indexes_evolution_messages.sql` | 66 | a | DDL estrutura | DROP INDEX — `evo.evolution_messages_wpp2_follow_up_at_idx`, `evo.evolution_messages_wpp2_created_at_idx`, `evo.evolution_messages_wpp2_remote_jid_idx`, `evo.evolution_messages_wpp2_message_id_idx`, `evo.evolution_messages_wpp2_contact_id_idx`, `evo.evolution_messages_comercial_01_follow_up_at_idx`, `evo.evolution_messages_comercial_01_created_at_idx`, `evo.evolution_messages_comercial_01_remote_jid_idx`, `evo.evolution_messages_comercial_01_message_id_idx`, `evo.evolution_messages_comercial_01_contact_id_idx` (+56 outros) |
| 18 | `20260806992000_drop_unused_tsvector_indexes.sql` | 3 | a | DDL estrutura | DROP INDEX — `evo.idx_evo_messages_tsvector`, `evo.idx_evo_contacts_tsvector`, `evo.idx_messages_content_search` |
| 19 | `20260806995001_autovacuum_bootstrap_log.sql` | 6 | a | DDL estrutura + contrato | CREATE TABLE, ALTER TABLE, GRANT, REVOKE — `evo.evolution_bootstrap_log` |
| 20 | `20260807101000_item85_sentinel_stale_race_fix.sql` | 3 | a | DDL estrutura + contrato | GRANT, REVOKE, CREATE  FUNCTION — `evo.fn_update_instance_health` |
| 21 | `20260807102155_onda3_d2_negocio_triggers_evo_contrato_views_rpc.sql` | 3 | a | DDL estrutura | CREATE  FUNCTION — `evo.fn_auto_assign_contact`, `evo.fn_log_assignment_change`, `evo.sync_contact_intelligence` |
| 22 | `20260807110002_ag_ex19_kpi_episodio.sql` | 4 | a | DDL estrutura + contrato | GRANT, REVOKE, COMMENT ON, CREATE  FUNCTION — `evo.fn_wpp2_uptime_kpi` |
| 23 | `20260807120000_revoke_anon_execute_six_functions.sql` | 4 | b | DDL contrato | GRANT, REVOKE — `evo.fn_feed_401_disconnect_alerts`, `evo.fn_wpp2_uptime_kpi` |
| 24 | `20260807120325_consolidate_rpc_insert_message.sql` | 2 | a | DDL estrutura | ALTER TABLE — `evo.evolution_messages` |
| 25 | `20260807190000_rpc_e2e_cleanup_v3_trigger_guard.sql` | 3 | a | DDL estrutura | ALTER TABLE — `evo.evolution_contacts` |
| 26 | `20260807235800_c3_restrict_rls_permissive_policies.sql` | 2 | b | DDL contrato | DROP POLICY POLICY, CREATE POLICY POLICY — `evo.evolution_labels` |
| 27 | `20260807250000_search_contacts_gin.sql` | 3 | a | DDL estrutura + contrato | GRANT, COMMENT ON, CREATE  FUNCTION — `evo.search_contacts_gin` |
| 28 | `20260807270000_session_backfill_pipeline_hardening.sql` | 4 | a | DDL estrutura | CREATE  FUNCTION — `evo.fn_pipeline_health_probe`, `evo.fn_check_401_rate`, `evo.fn_check_ack_stall`, `evo.fn_auto_ban_401_abusers` |
| 29 | `20260808110004_cleanup_hygiene_wave.sql` | 1 | a | DDL estrutura | DROP INDEX — `evo.idx_evo_graveyard_expiration` |
| 30 | `20260808120001_drop_redundant_partition_rjid_indexes.sql` | 8 | a | DDL estrutura | CREATE INDEX, DROP INDEX — `evo.evolution_messages_compras`, `evo.evolution_messages_financeiro`, `evo.evolution_messages_logistica`, `evo.evolution_messages_marketing`, `evo.idx_compras_rjid`, `evo.idx_financeiro_rjid`, `evo.idx_logistica_rjid`, `evo.idx_marketing_rjid` |
| 31 | `20260808150000_hotfix_revoke_exec_sql_anon.sql` | 7 | b | DDL contrato | REVOKE — `evo.fn_auto_resolve_alerts`, `evo.fn_check_401_rate`, `evo.fn_check_ack_stall`, `evo.fn_check_connection_saturation`, `evo.fn_retention_webhook_partitions`, `evo.fn_dedup_alert`, `evo.p_backfill_evolution_messages` |
| 32 | `20260808230200_revoke_anon_execute_search_contacts_gin.sql` | 3 | b | DDL contrato | GRANT, REVOKE — `evo.search_contacts_gin` |
| 33 | `20260808240000_fix_gap01_search_contacts_gin_expression.sql` | 5 | a | DDL estrutura + contrato | CREATE FUNCTION, DROP FUNCTION, GRANT, COMMENT ON — `evo.search_contacts_gin` |
| 34 | `20260808260000_shadow_mode_fns_and_canonical_route_fix.sql` | 4 | a | DDL estrutura + contrato | COMMENT ON, CREATE  FUNCTION — `evo.fn_canonical_route_decision`, `evo.fn_shadow_snapshot_daily`, `evo.fn_canonical_route_check_daily` |
| 35 | `20260808280000_fix_security_definer_evo_fns_anon_access.sql` | 8 | b | DDL contrato | GRANT, REVOKE — `evo.fn_canonical_route_check_daily`, `evo.fn_shadow_snapshot_daily`, `evo.fn_shadow_source_measurement`, `evo.fn_canonical_route_decision` |
| 36 | `20260809000000_versioned_drops_and_jwt_ref.sql` | 3 | a | DDL estrutura | DROP TABLE — `evo.evolution_broadcasts`, `evo.evolution_automations`, `evo.evolution_groups` |
| 37 | `20260809180000_queue_autorouter_wiring.sql` | 1 | a | DDL estrutura | DROP TRIGGER — `evo.evolution_contacts` |
| 38 | `20260810170000_g6_batch_mode_guards_evolution_contacts.sql` | 9 | a | DDL estrutura | DROP TRIGGER — `evo.evolution_contacts` |
| 39 | `20260810200100_fix_consumer_stats_fdw_evolution_postgres.sql` | 1 | a | DDL estrutura | CREATE TABLE — `evo.evolution_rabbit_consumer_stats_fdw` |
| 40 | `20260810200300_fn_delete_test_contacts.sql` | 2 | a | DDL estrutura + contrato | COMMENT ON, CREATE  FUNCTION — `evo.fn_delete_test_contacts` |
| 41 | `20260811130000_grupos.sql` | 35 | a | DDL estrutura + contrato | CREATE TABLE, ALTER TABLE, DROP TABLE, DROP FUNCTION, CREATE INDEX, DROP INDEX, DROP TRIGGER, GRANT, REVOKE, COMMENT ON, CREATE POLICY POLICY, CREATE  FUNCTION — `evo.evolution_groups`, `evo.evolution_group_participants`, `evo.fn_set_updated_at`, `evo.fn_resolve_contact_id_by_jid`, `evo.fn_upsert_group_participants`, `evo.fn_upsert_group_from_event`, `evo.fn_sync_groups_from_api`, `evo.evolution_groups_name_trgm_idx`, `evo.evolution_groups_instance_idx`, `evo.evolution_groups_connection_idx` (+1 outros) |
| 42 | `20260811140000_status_contato.sql` | 22 | a | DDL estrutura + contrato | CREATE TABLE, ALTER TABLE, DROP TABLE, DROP FUNCTION, CREATE INDEX, GRANT, REVOKE, CREATE POLICY POLICY, CREATE  FUNCTION — `evo.evolution_contacts`, `evo.fn_touch_contact_presence`, `evo.fn_mark_status_viewed`, `evo.evolution_whatsapp_check_queue`, `evo.fn_check_whatsapp_numbers` |
| 43 | `20260811150100_evo_integridade_fks_limpezas.sql` | 30 | a | DDL estrutura + contrato | ALTER TABLE, DROP TABLE, DROP INDEX, COMMENT ON, CREATE  VIEW  VIEW, DROP POLICY POLICY — `evo.v_doc_coverage`, `evo.evolution_alerts`, `evo.evolution_pipeline_health_log`, `evo.evolution_reactions`, `evo.idx_evo_media_remote_jid_created`, `evo.idx_conv_wpp2_agent_status_last`, `evo.idx_notif_status_read_created`, `evo.idx_ingest_ledger_msgid`, `evo.evolution_messages_comercial_03`, `evo.media_loss_registry` (+8 outros) |
| 44 | `20260811150200_evo_doc_comments_massivos.sql` | 1913 | b | DDL contrato | COMMENT ON — `evo.evolution_conversations`, `evo.evolution_conversations_compras`, `evo.evolution_contacts`, `evo.evolution_conversations_default`, `evo.evolution_conversations_financeiro`, `evo.evolution_conversations_logistica`, `evo.evolution_conversations_marketing`, `evo.evolution_message_queue`, `evo.evolution_message_templates`, `evo.evolution_messages_comercial_03` (+268 outros) |
| 45 | `20260811150300_notificacoes.sql` | 10 | a | DDL estrutura + contrato | CREATE TABLE, ALTER TABLE, DROP TABLE, CREATE INDEX, DROP CONSTRAINT, GRANT, CREATE POLICY POLICY — `evo.evolution_notification_outbox`, `evo.evolution_notifications` |
| 46 | `20260811150400_evo_notification_outbox_dispatcher.sql` | 5 | a | DDL estrutura + contrato | ALTER TABLE, COMMENT ON — `evo.evolution_notification_outbox` |
| 47 | `20260811160000_revoke_auth_exec_fns_novas.sql` | 7 | b | DDL contrato | REVOKE — `evo.fn_resolve_contact_id_by_jid`, `evo.fn_upsert_group_participants`, `evo.fn_upsert_group_from_event`, `evo.fn_touch_contact_presence`, `evo.fn_mark_status_viewed`, `evo.fn_check_whatsapp_numbers`, `evo.fn_sync_groups_from_api` |
| 48 | `20260811180000_depreca_funcoes_pgnet.sql` | 2 | a | DDL estrutura | DROP FUNCTION — `evo.fn_sync_groups_from_api`, `evo.fn_check_whatsapp_numbers` |
| 49 | `20260811203000_grupos_admin_phone.sql` | 5 | a | DDL estrutura + contrato | ALTER TABLE, COMMENT ON, CREATE  FUNCTION — `evo.evolution_group_participants`, `evo.fn_upsert_group_participants`, `evo.fn_upsert_group_from_event` |
| 50 | `20260814010000_fix_inbound_silencio_comercial.sql` | 1 | a | DDL estrutura | CREATE  FUNCTION — `evo.fn_checar_inbound_zerado` |
| 51 | `20260814060000_fix_wpp2_uptime_kpi_warn_resolve.sql` | 3 | a | DDL estrutura | DROP FUNCTION, CREATE  FUNCTION — `evo.fn_wpp2_uptime_kpi` |
| 52 | `20260814150000_fix_fn_detect_401_bursts_dedup.sql` | 1 | a | DDL estrutura | CREATE  FUNCTION — `evo.fn_detect_401_bursts` |
| 53 | `20260815040000_decouple_e26_evo_detect_instance_recreate.sql` | 2 | a | DDL estrutura + contrato | COMMENT ON, CREATE  FUNCTION — `evo.fn_detect_instance_recreate` |
| 54 | `20260815050000_decouple_e27_evo_download_wa_status_media.sql` | 2 | a | DDL estrutura + contrato | COMMENT ON, CREATE  FUNCTION — `evo.fn_download_wa_status_media` |
| 55 | `20260815060000_decouple_e28_evo_notify_sicoob_on_reply.sql` | 2 | a | DDL estrutura + contrato | COMMENT ON, CREATE  FUNCTION — `evo.fn_notify_sicoob_on_reply` |
| 56 | `20260815070000_decouple_e29_evo_sync_lid_from_api.sql` | 4 | a | DDL estrutura + contrato | COMMENT ON, CREATE  FUNCTION — `evo.fn_sync_lid_from_api` |
| 57 | `20260815080000_decouple_e30_evo_trigger_audio_transcription.sql` | 2 | a | DDL estrutura + contrato | COMMENT ON, CREATE  FUNCTION — `evo.fn_trigger_audio_transcription` |
| 58 | `20260815200002_decouple_i4_wa_status_media.sql` | 1 | a | DDL estrutura | CREATE  FUNCTION — `evo.fn_download_wa_status_media` |
| 59 | `20260815200003_decouple_i4_audio_transcription.sql` | 1 | a | DDL estrutura | CREATE  FUNCTION — `evo.fn_trigger_audio_transcription` |
| 60 | `20260815200004_decouple_i4_instance_recreate.sql` | 1 | a | DDL estrutura | CREATE  FUNCTION — `evo.fn_detect_instance_recreate` |
| 61 | `20260815200008_decouple_i4_sicoob.sql` | 1 | a | DDL estrutura | CREATE  FUNCTION — `evo.fn_notify_sicoob_on_reply` |
| 62 | `20260815200012_decouple_i4_purge_storage_cache.sql` | 1 | a | DDL estrutura | CREATE  FUNCTION — `evo.fn_purge_storage_cache` |

## 4. Notas

- `20260804000000_canonical_schema_squash_133_migrations.sql` é o squash canônico (98 linhas tocando `evo`, 48 objetos) — maior concentração de DDL estrutural.
- `20260811150200_evo_doc_comments_massivos.sql` é o maior arquivo de contrato: 1.913 linhas `COMMENT ON` cobrindo 278 objetos `evo` (documentação de contrato).
- `20260804170000_fix_rls_systematic_coverage.sql` usa DDL dinâmico (`EXECUTE format('ALTER TABLE evo.%I ENABLE ROW LEVEL SECURITY')`) — objetos resolvidos em runtime, não listáveis estaticamente.
- `20260806210200_f12_linkage_realtime_view.sql` **não** entra na lista: só casa com a regex em modo case-insensitive (menção em comentário `-- Grant de leitura ... evo.v_security_audit`), sem DDL real sobre `evo`.
- Contagem vs. expectativa (~52–55): a diferença vem da regex exata (palavras-chave em maiúsculas, `` antes de `evo.`) e de migrations novas (ondas decouple_e26–e30 e decouple_i4 adicionaram 9 arquivos).
- Nenhuma migration toca `evo` apenas via `SELECT/INSERT/UPDATE` (DML) — a lista cobre somente DDL conforme a regex.

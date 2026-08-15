# FUNCTIONS_CLASSIFICATION — Classificação das 160 funções da fronteira (E49)

> **Onda:** Fase 3 (gates/medições) · **Etapa:** E49 · **Data da medição:** 2026-08-15
> **Fonte:** `.hermes/fase3/physrefs.json` (160 funções medidas no banco de produção — 108 zapp, 38 evo, 11 ops, 3 public) + `.hermes/fase3/crons.json` (220 cron jobs) + greps no repo + consulta read-only `pg_trigger`/`pg_proc` no banco.
> **Escopo:** documental — NADA é dropado aqui. E50 arquiva (outra leva).

## Resumo por balde

| Balde | Qtd | Critério |
|---|---:|---|
| **NEGOCIO** | 111 | mensagens/contatos/conversas/leads — tem consumidor (cron, trigger, src/, edge function, sync-ignore) e nome não é de monitoria/ops |
| **MONITORIA** | 39 | nome sugere alert/health/check/monitor/audit/retention/cleanup (monitoria+ops) — com consumidor |
| **MORTA** | 9 | sem cron, sem trigger, sem chamador em src/ (e sem chamador no DB/repo) |
| **INDETERMINADA** | 1 | incerta — ver motivo na linha |
| **TOTAL** | 160 | 160 entradas de physrefs.json (156 funções únicas; 4 com overloads de args) |

## Tabela completa (160 entradas)

Colunas: `função | args | balde | evidência do consumidor (motivo se MORTA/INDETERMINADA)`

### NEGOCIO (111)

| função | args | balde | evidência / motivo |
|---|---|---|---|
| `evo.fn_apply_lid_mappings` | `p_dry_run boolean, p_batch integer` | NEGOCIO | cron:lid-phonejid-emergence-watchdog; src/app:1 arquivo(s) |
| `evo.fn_backfill_contact_id` | `p_batch integer` | NEGOCIO | cron:backfill-contact-id-ongoing; src/app:1 arquivo(s) |
| `evo.fn_delete_test_contacts` | `p_pattern text` | NEGOCIO | src/app:1 arquivo(s) |
| `evo.fn_lid_regression_suite` | `` | NEGOCIO | cron:lid-regression-suite-2h; src/app:1 arquivo(s) |
| `evo.fn_normalize_conversation_jid` | `` | NEGOCIO | trigger-DB:trigger trg_normalize_conversation_jid em evo.evolution_conversations_wpp2 (BEFORE INSERT OR UPDATE) |
| `evo.fn_normalize_remote_jid` | `` | NEGOCIO | trigger-DB:trigger trg_normalize_remote_jid em evo.evolution_messages_wpp2 (BEFORE INSERT OR UPDATE) |
| `evo.fn_notify_sicoob_on_reply` | `` | NEGOCIO | trigger:supabase/migrations/20260815060000_decouple_e28_evo_notify_sicoob_on_reply.sql:8,supabase/migrations/20260815200008_decouple_i4_sicoob.sql:8; edge/script:scripts/decouple/fixtures/sql_report_snapshot.json |
| `evo.fn_passive_lid_accumulator` | `p_lookback_hours integer` | NEGOCIO | cron:lid-passive-accumulator,lid-phonejid-emergence-watchdog; src/app:1 arquivo(s) |
| `evo.fn_post_upgrade_verify` | `p_timeout_minutes integer` | NEGOCIO | cron:evo-schema-guardian-monthly; src/app:1 arquivo(s) |
| `evo.fn_prepare_lid_dedup` | `p_dry_run boolean, p_instance text, p_batch_size integer` | NEGOCIO | src/app:1 arquivo(s) |
| `evo.fn_repontar_filhas_graveyard` | `p_dry_run boolean` | NEGOCIO | cron:repontar-filhas-graveyard |
| `evo.fn_resolve_contact_id_by_jid` | `p_jid text` | NEGOCIO | src/app:1 arquivo(s) |
| `evo.fn_sync_messages_to_v2` | `` | NEGOCIO | cron:evo-sync-messages-to-v2; src/app:1 arquivo(s) |
| `evo.fn_sync_status_from_messages` | `` | NEGOCIO | trigger-DB:trigger trg_sync_status_to_dedicated em evo.evolution_messages_wpp2 (BEFORE INSERT) |
| `evo.fn_touch_contact_last_message` | `` | NEGOCIO | trigger-DB:trigger trg_touch_contact_last_message em evo.evolution_messages_wpp2 (BEFORE INSERT) |
| `evo.fn_touch_contact_presence` | `p_remote_jid text, p_presence text, p_instance text` | NEGOCIO | src/app:1 arquivo(s) |
| `evo.fn_trigger_audio_transcription` | `p_batch_size integer` | NEGOCIO | cron:audio-transcription-trigger; src/app:1 arquivo(s); edge/script:scripts/decouple/fixtures/sql_report_snapshot.json |
| `evo.rpc_complete_media_download` | `p_queue_id bigint, p_download_url text, p_storage_path text` | NEGOCIO | src/app:1 arquivo(s) |
| `evo.search_contacts_gin` | `p_query text, p_limit integer, p_offset integer, p_min_sim double precision` | NEGOCIO | src/app:1 arquivo(s) |
| `public.rpc_get_contact` | `p_contact_id uuid` | NEGOCIO | src/app:11 arquivo(s); src/test:2 arquivo(s); sync-ignore: chamada no frontend via client externo (allowlist curada); edge/script:supabase/functions/_shared/evolution-webhook-handlers.ts |
| `public.rpc_get_contact` | `p_remote_jid text, p_instance text` | NEGOCIO | src/app:11 arquivo(s); src/test:2 arquivo(s); sync-ignore: chamada no frontend via client externo (allowlist curada); edge/script:supabase/functions/_shared/evolution-webhook-handlers.ts |
| `public.set_audio_transcription` | `p_message_id text, p_transcription text, p_status text, p_error_code text, p_error_reason text` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.anonymize_contacts_batch` | `contact_ids uuid[]` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.auto_assign_to_queue_agent_sh` | `` | NEGOCIO | trigger-DB:trigger on_contact_queue_auto_assign em zapp.evolution_contacts (BEFORE INSERT OR UPDATE) |
| `zapp.bulk_auto_merge_duplicates` | `p_instance_name text, p_limit integer` | NEGOCIO | src/app:3 arquivo(s) |
| `zapp.bulk_soft_delete_contacts` | `p_contact_ids uuid[], p_reason text` | NEGOCIO | src/app:2 arquivo(s) |
| `zapp.bulk_update_lead_status` | `p_contact_ids uuid[], p_status text` | NEGOCIO | src/app:2 arquivo(s) |
| `zapp.contacts_count_by_type` | `` | NEGOCIO | src/app:3 arquivo(s); sync-ignore: chamada no frontend via client externo (allowlist curada) |
| `zapp.delete_contact_completely` | `p_contact_id uuid` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.find_duplicate_contacts` | `p_workspace_id text, p_limit integer` | NEGOCIO | src/app:3 arquivo(s) |
| `zapp.fn_auto_save_received_sticker` | `` | NEGOCIO | trigger-DB:trigger trg_auto_save_sticker_wpp2 em evo.evolution_messages_wpp2 (BEFORE INSERT) |
| `zapp.fn_contacts_view_delete_handler` | `` | NEGOCIO | trigger:supabase/migrations/20260804000000_canonical_schema_squash_133_migrations.sql:14753,supabase/migrations/20260804000000_canonical_schema_squash_133_migrations.sql:14769 |
| `zapp.fn_contacts_view_insert_handler` | `` | NEGOCIO | trigger:supabase/migrations/20260812160000_fix_trigger_lead_status.sql:15 |
| `zapp.fn_contacts_view_update_handler` | `` | NEGOCIO | trigger-DB:trigger trg_contacts_view_update em zapp.contacts (INSTEAD OF UPDATE) |
| `zapp.fn_cron_guardian` | `` | NEGOCIO | cron:cron-guardian; src/app:1 arquivo(s) |
| `zapp.fn_enqueue_message_dispatch` | `p_message_id uuid, p_instance text` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.fn_handle_whatsapp_status` | `p_payload jsonb, p_instance text` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.fn_lgpd_anonymize_deleted_contacts` | `p_days_threshold integer` | NEGOCIO | src/app:1 arquivo(s); edge/script:supabase/functions/lgpd-scheduled-jobs/index.ts |
| `zapp.fn_message_rate_5min` | `` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.fn_messages_instead_of_insert` | `` | NEGOCIO | src/app:1 arquivo(s); sync-ignore: chamada no frontend via client externo (allowlist curada) |
| `zapp.fn_messages_view_insert_handler` | `` | NEGOCIO | trigger:supabase/migrations/20260804000000_canonical_schema_squash_133_migrations.sql:310,supabase/migrations/20260804000000_canonical_schema_squash_133_migrations.sql:315 |
| `zapp.fn_normalize_send_jid` | `p_jid text, p_instance text` | NEGOCIO | src/app:1 arquivo(s); edge/script:scripts/decouple/fixtures/sql_report_snapshot.json |
| `zapp.fn_process_contacts_batch` | `p_contacts jsonb, p_instance text` | NEGOCIO | src/app:1 arquivo(s); edge/script:supabase/functions/_shared/evolution-webhook-handlers.ts |
| `zapp.fn_process_message_edited` | `p_payload jsonb, p_instance text` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.fn_process_whatsapp_message` | `p_payload jsonb, p_instance text` | NEGOCIO | trigger:supabase/migrations/20260814110000_f4_security_unread_fixes.sql:6; src/app:1 arquivo(s); sync-ignore: chamada no frontend via client externo (allowlist curada) |
| `zapp.fn_queue_autoassign_tick` | `p_limit integer` | NEGOCIO | cron:queue-autoassign-tick; trigger:supabase/migrations/20260809180000_queue_autorouter_wiring.sql:27; src/app:1 arquivo(s) |
| `zapp.fn_register_instance` | `p_instance_name character varying, p_display_name character varying, p_phone character varying, p_department character varying, p_responsible character varying` | NEGOCIO | src/app:1 arquivo(s); edge/script:scripts/sql/check-reference-integrity.sql |
| `zapp.fn_retry_stuck_messages` | `` | NEGOCIO | cron:retry-stuck-messages; src/app:1 arquivo(s) |
| `zapp.fn_webhook_pipeline_score` | `p_eff_state text` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.fn_zapp_web_smoke_test_v2` | `` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.get_companies_by_phones_batch` | `p_phones text[]` | NEGOCIO | src/app:4 arquivo(s); src/test:1 arquivo(s) |
| `zapp.get_compliance_metrics` | `snapshot_time timestamp without time zone` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.get_compliance_metrics_v2` | `` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.get_contact_360_by_phone` | `p_phone text, p_instance text` | NEGOCIO | src/app:4 arquivo(s); src/test:1 arquivo(s) |
| `zapp.get_contact_conversations` | `p_contact_id uuid, p_limit integer` | NEGOCIO | src/app:2 arquivo(s) |
| `zapp.get_contact_intelligence_by_phone` | `p_phone text` | NEGOCIO | src/app:3 arquivo(s) |
| `zapp.get_contact_stats` | `p_instance_name text` | NEGOCIO | src/app:2 arquivo(s) |
| `zapp.get_contacts_360_batch` | `p_phones text[]` | NEGOCIO | src/app:3 arquivo(s) |
| `zapp.get_conversations_safe_join` | `` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.get_duplicate_report` | `p_instance_name text` | NEGOCIO | src/app:2 arquivo(s) |
| `zapp.get_lgpd_compliance_stats` | `p_instance_name text` | NEGOCIO | src/app:2 arquivo(s) |
| `zapp.get_segment_contacts` | `p_segment_id uuid, p_limit integer, p_offset integer` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.grant_lgpd_consent` | `p_contact_id uuid, p_channel text, p_marketing_consent boolean, p_data_sharing boolean, p_profiling boolean` | NEGOCIO | src/app:3 arquivo(s); sync-ignore: chamada no frontend via client externo (allowlist curada) |
| `zapp.mark_follow_up_done` | `p_message_id uuid` | NEGOCIO | src/app:2 arquivo(s) |
| `zapp.merge_contacts` | `p_primary_id uuid, p_secondary_id uuid, p_merged_fields jsonb` | NEGOCIO | src/app:3 arquivo(s) |
| `zapp.messages_instead_of_delete` | `` | NEGOCIO | trigger-DB:trigger messages_instead_of_delete_tg em zapp.messages (INSTEAD OF DELETE) |
| `zapp.messages_update_trigger` | `` | NEGOCIO | trigger:supabase/migrations/20260804000000_canonical_schema_squash_133_migrations.sql:12103,supabase/migrations/20260804000000_canonical_schema_squash_133_migrations.sql:12105; src/app:1 arquivo(s) |
| `zapp.populate_contact_intelligence_batch` | `p_batch_size integer, p_offset integer` | NEGOCIO | src/app:1 arquivo(s); sync-ignore: chamada no frontend via client externo (allowlist curada) |
| `zapp.revoke_lgpd_consent` | `p_contact_id uuid, p_reason text` | NEGOCIO | src/app:3 arquivo(s); sync-ignore: chamada no frontend via client externo (allowlist curada) |
| `zapp.rpc_backfill_messages_contact_id` | `p_instance_name text, p_batch_size integer, p_dry_run boolean` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.rpc_bulk_repair_dedup_hashes` | `p_instance_name text, p_batch_size integer, p_dry_run boolean` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.rpc_claim_outbound_message` | `p_row_id uuid, p_message_id text, p_status text` | NEGOCIO | edge/script:supabase/functions/_shared/evolution-webhook-messages.ts |
| `zapp.rpc_delete_contact` | `p_remote_jid text, p_instance text, p_performed_by text` | NEGOCIO | src/app:2 arquivo(s) |
| `zapp.rpc_delete_message` | `p_id uuid` | NEGOCIO | src/app:3 arquivo(s) |
| `zapp.rpc_get_contact` | `p_contact_id uuid` | NEGOCIO | src/app:11 arquivo(s); src/test:2 arquivo(s); sync-ignore: chamada no frontend via client externo (allowlist curada); edge/script:supabase/functions/_shared/evolution-webhook-handlers.ts |
| `zapp.rpc_get_contact` | `p_remote_jid text, p_instance text` | NEGOCIO | src/app:11 arquivo(s); src/test:2 arquivo(s); sync-ignore: chamada no frontend via client externo (allowlist curada); edge/script:supabase/functions/_shared/evolution-webhook-handlers.ts |
| `zapp.rpc_get_message_details` | `p_message_id uuid` | NEGOCIO | src/app:3 arquivo(s) |
| `zapp.rpc_global_search` | `p_query text, p_limit integer, p_instance text` | NEGOCIO | src/app:2 arquivo(s) |
| `zapp.rpc_global_search` | `p_query text, p_instance text, p_limit integer` | NEGOCIO | src/app:2 arquivo(s) |
| `zapp.rpc_inbox_preview_batch` | `p_remote_jids text[], p_instance text, p_limit integer` | NEGOCIO | src/app:2 arquivo(s) |
| `zapp.rpc_insert_message` | `p_remote_jid text, p_content text, p_instance text, p_message_id text, p_from_me boolean, p_direction text, p_message_type text, p_media_url text, p_metadata jsonb, p_provider text, p_timestamp timestamp with time zone, p_contact_id uuid, p_quoted_message_id text, p_caption text, p_ingest_meta jsonb, p_media_meta jsonb, p_media_bucket text, p_media_path text, p_media_status text, p_status_at timestamp with time zone, p_push_name text` | NEGOCIO | src/app:4 arquivo(s); sync-ignore: chamada no frontend via client externo (allowlist curada); edge/script:supabase/functions/whatsapp-cloud-api/index.ts,supabase/functions/whatsapp-cloud-webhook/index.ts,supabase/functions/_shared/ingest-port.ts |
| `zapp.rpc_list_contact_links` | `p_contact_id uuid, p_limit integer` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.rpc_list_contacts` | `p_instance text, p_lead_status text, p_assigned_to text, p_search text, p_limit integer, p_offset integer` | NEGOCIO | src/app:3 arquivo(s); src/test:1 arquivo(s); sync-ignore: chamada no frontend via client externo (allowlist curada); edge/script:supabase/functions/evolution-api/__tests__/v237-fallback.test.ts,supabase/functions/_shared/evolution-fallback-telemetry.ts |
| `zapp.rpc_list_conversations` | `p_instance text, p_status text, p_assigned_to text, p_limit integer, p_offset integer` | NEGOCIO | src/app:4 arquivo(s); src/test:1 arquivo(s); sync-ignore: chamada no frontend via client externo (allowlist curada); edge/script:supabase/functions/evolution-api/__tests__/v237-fallback.test.ts,supabase/functions/_shared/evolution-fallback-telemetry.ts,supabase/functions/_shared/__tests__/evolution-fallback-telemetry.test.ts |
| `zapp.rpc_list_messages` | `p_remote_jid text, p_instance text, p_limit integer, p_before_date timestamp with time zone` | NEGOCIO | src/app:4 arquivo(s); sync-ignore: chamada no frontend via client externo (allowlist curada); edge/script:e2e/connection-to-inbox-inbound.spec.ts,e2e/decouple-fake-provider.spec.ts,e2e/inbox-created-thread-inbound.spec.ts |
| `zapp.rpc_list_messages_all` | `p_instance text, p_contact_id uuid, p_conversation_id uuid, p_direction text, p_message_type text, p_search text, p_limit integer, p_offset integer` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.rpc_list_messages_lite` | `p_remote_jid text, p_instance text, p_limit integer, p_offset integer, p_before_date timestamp with time zone` | NEGOCIO | src/app:4 arquivo(s); src/test:1 arquivo(s); edge/script:e2e/connection-to-inbox-inbound.spec.ts,e2e/decouple-fake-provider.spec.ts,e2e/inbox-created-thread-inbound.spec.ts |
| `zapp.rpc_mark_conversation_read` | `p_id uuid` | NEGOCIO | trigger:supabase/migrations/20260814110000_f4_security_unread_fixes.sql:8; src/app:2 arquivo(s); src/test:1 arquivo(s) |
| `zapp.rpc_mark_messages_as_read` | `p_contact_id uuid` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.rpc_mark_messages_deleted` | `p_contact_id uuid, p_instance text` | NEGOCIO | edge/script:supabase/functions/_shared/evolution-webhook-handlers.ts |
| `zapp.rpc_mark_messages_read` | `p_conversation_id uuid` | NEGOCIO | trigger:supabase/migrations/20260814110000_f4_security_unread_fixes.sql:7; src/app:3 arquivo(s); edge/script:supabase/functions/_shared/evolution-webhook-handlers.ts |
| `zapp.rpc_mark_messages_read` | `p_contact_id uuid, p_instance text` | NEGOCIO | trigger:supabase/migrations/20260814110000_f4_security_unread_fixes.sql:7; src/app:3 arquivo(s); edge/script:supabase/functions/_shared/evolution-webhook-handlers.ts |
| `zapp.rpc_message_stats` | `p_instance text, p_days_back integer, p_assigned_to text` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.rpc_resolve_instance_by_phone` | `p_phone text` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.rpc_resolve_whatsapp_instance` | `p_contact_id uuid` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.rpc_schedule_follow_up` | `p_message_id uuid, p_follow_up_at timestamp with time zone, p_follow_up_done boolean` | NEGOCIO | src/app:2 arquivo(s) |
| `zapp.rpc_search_messages` | `p_query text, p_instance text, p_limit integer` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.rpc_send_sticker` | `p_contact_id uuid, p_sticker_url text, p_instance_name text, p_sticker_id uuid, p_created_by uuid` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.rpc_toggle_message_important` | `p_message_id uuid, p_value boolean` | NEGOCIO | src/app:2 arquivo(s) |
| `zapp.rpc_toggle_message_star` | `p_message_id uuid, p_value boolean` | NEGOCIO | src/app:2 arquivo(s) |
| `zapp.rpc_unified_search` | `p_query text, p_limit integer` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.rpc_update_incoming_message` | `p_row_id uuid, p_contact_id uuid, p_content text, p_message_type text, p_media_url text, p_media_bucket text, p_media_path text, p_media_status text, p_from_me boolean, p_direction text, p_status text, p_ingest_meta jsonb, p_quoted_message_id text` | NEGOCIO | edge/script:supabase/functions/_shared/evolution-webhook-messages.ts,supabase/functions/_shared/__tests__/incoming-contact-insert-log.test.ts |
| `zapp.rpc_update_message_transcription` | `p_message_uuid uuid, p_status text, p_transcription text` | NEGOCIO | edge/script:supabase/functions/_shared/evolution-webhook-messages.ts |
| `zapp.rpc_upsert_contact` | `p_remote_jid text, p_instance text, p_push_name text, p_full_name text, p_phone_number text, p_email text, p_company text, p_role_title text, p_lead_status text, p_lead_source text, p_lead_score integer, p_assigned_to text, p_tags text[], p_notes text` | NEGOCIO | src/app:5 arquivo(s); sync-ignore: chamada no frontend via client externo (allowlist curada); edge/script:supabase/functions/whatsapp-cloud-webhook/index.ts,supabase/functions/_shared/ingest-port.ts |
| `zapp.search_contacts_advanced` | `p_search text, p_vendedor text, p_ramo text, p_rfm_segment text, p_estado text, p_cliente_ativado boolean, p_ja_comprou boolean, p_sort_by text, p_page integer, p_page_size integer` | NEGOCIO | src/app:3 arquivo(s); src/test:1 arquivo(s) |
| `zapp.send_message_v2` | `p_remote_jid text, p_content text, p_message_type text, p_media_url text, p_media_mimetype text, p_instance text` | NEGOCIO | src/app:3 arquivo(s) |
| `zapp.sync_interaction_from_zapp` | `p_phone text, p_channel text, p_direction text, p_assunto text, p_resumo text, p_conteudo text, p_sentiment text, p_message_count integer, p_duration_seconds integer, p_agent_name text, p_zapp_conversation_id text` | NEGOCIO | src/app:2 arquivo(s) |
| `zapp.sync_tag_use_counts` | `` | NEGOCIO | src/app:1 arquivo(s) |
| `zapp.update_contact_versioned` | `p_contact_id uuid, p_expected_version integer, p_updates jsonb` | NEGOCIO | src/app:4 arquivo(s) |
| `zapp.upsert_contact_intelligence` | `p_contact_id uuid` | NEGOCIO | src/app:1 arquivo(s); sync-ignore: chamada no frontend via client externo (allowlist curada) |
| `zapp.zapp_isonwa_mark` | `p_jids text[], p_ok_jids text[]` | NEGOCIO | src/app:1 arquivo(s); edge/script:supabase/functions/evolution-group-sync/index.ts,supabase/functions/evolution-group-sync/__tests__/isonwa.test.ts |

### MONITORIA (39)

| função | args | balde | evidência / motivo |
|---|---|---|---|
| `evo.fn_alert_ghost_conversations` | `` | MONITORIA | cron:ghost-conversations-daily-alert |
| `evo.fn_cache_warmup_after_vacuum` | `` | MONITORIA | cron:cache-warmup-after-vacuum; src/app:1 arquivo(s) |
| `evo.fn_check_ack_stall` | `` | MONITORIA | cron:check_ack_stall; src/app:1 arquivo(s) |
| `evo.fn_cleanup_test_artifacts` | `p_confirm boolean, p_max_age_hours integer` | MONITORIA | src/app:1 arquivo(s) |
| `evo.fn_detect_dedup_cap_failures` | `p_window interval` | MONITORIA | cron:evo-dedup-cap-monitor; src/app:1 arquivo(s) |
| `evo.fn_e2e_media_probe` | `p_window_hours integer` | MONITORIA | cron:e2e-media-probe-daily,e2e-media-probe-hourly; src/app:1 arquivo(s) |
| `evo.fn_enqueue_orphan_media` | `p_limit integer, p_days_back integer` | MONITORIA | cron:enqueue-orphan-media-hourly; src/app:1 arquivo(s) |
| `evo.fn_ensure_evolution_backcompat_views` | `` | MONITORIA | cron:ensure-evolution-backcompat-views; src/app:1 arquivo(s) |
| `evo.fn_expire_whatsapp_media_urls` | `p_days_old integer, p_batch_limit integer` | MONITORIA | cron:expire-whatsapp-media-1h; src/app:1 arquivo(s) |
| `evo.fn_handle_expired_r2_media` | `` | MONITORIA | cron:sync-r2-lifecycle; src/app:1 arquivo(s) |
| `evo.fn_link_orphan_messages` | `p_limit integer` | MONITORIA | cron:link-orphan-messages; src/app:1 arquivo(s) |
| `evo.fn_monitor_lid_contamination` | `` | MONITORIA | cron:lid-contamination-daily; src/app:1 arquivo(s) |
| `evo.fn_monthly_evo_audit` | `` | MONITORIA | cron:monthly-evo-audit; src/app:1 arquivo(s); edge/script:scripts/decouple/ownership-gate.mjs |
| `evo.fn_pipeline_health_probe` | `` | MONITORIA | cron:evolution-pipeline-probe-15min; src/app:1 arquivo(s) |
| `evo.fn_purge_lid_orphan_messages_batch` | `p_batch_size integer` | MONITORIA | src/app:1 arquivo(s) |
| `evo.fn_update_instance_health` | `` | MONITORIA | cron:evo-instance-health-check; src/app:1 arquivo(s) |
| `ops.check_marketing_budget` | `` | MONITORIA | cron:daily-wa-marketing-budget; sync-ignore: chamada no frontend via client externo (allowlist curada) |
| `ops.fn_alert_consumer_halt` | `` | MONITORIA | cron:alert-consumer-halt; sync-ignore: chamada no frontend via client externo (allowlist curada) |
| `ops.fn_check_view_column_drift` | `` | MONITORIA | cron:view-column-drift-guard |
| `ops.fn_dashboard` | `` | MONITORIA | sync-ignore: chamada no frontend via client externo (allowlist curada) |
| `ops.fn_guardrails_check` | `` | MONITORIA | cron:ops-guardrails-deadman; sync-ignore: chamada no frontend via client externo (allowlist curada) |
| `ops.fn_monitor_ingestion_persistence_gap` | `p_window interval, p_min_upserts integer, p_degraded_ratio numeric, p_cooldown interval` | MONITORIA | cron:monitor-ingestion-persistence-gap; sync-ignore: chamada no frontend via client externo (allowlist curada) |
| `ops.fn_payload_retention` | `p_days integer, p_dry_run boolean` | MONITORIA | cron:ops-payload-retention; sync-ignore: chamada no frontend via client externo (allowlist curada) |
| `ops.sim_wa_budget_guard` | `` | MONITORIA | sync-ignore: chamada no frontend via client externo (allowlist curada) |
| `zapp.fn_archive_old_wpp2_messages` | `p_months_old integer, p_batch_size integer` | MONITORIA | cron:archive-old-wpp2-messages; src/app:1 arquivo(s) |
| `zapp.fn_audit_checksum_head_tail` | `` | MONITORIA | src/app:1 arquivo(s) |
| `zapp.fn_audit_checksum_messagetimestamp` | `` | MONITORIA | src/app:1 arquivo(s) |
| `zapp.fn_audit_sample_match` | `` | MONITORIA | src/app:1 arquivo(s) |
| `zapp.fn_check_evolution_jid_health` | `` | MONITORIA | cron:evolution-jid-health-check-5min; src/app:1 arquivo(s) |
| `zapp.fn_check_evolution_pipeline_health` | `` | MONITORIA | cron:evolution-pipeline-health-check-bateria10; src/app:1 arquivo(s) |
| `zapp.fn_get_evolution_health_summary` | `` | MONITORIA | src/app:1 arquivo(s) |
| `zapp.fn_lgpd_purge_message_metadata` | `p_days_threshold integer` | MONITORIA | src/app:1 arquivo(s); edge/script:supabase/functions/lgpd-scheduled-jobs/index.ts |
| `zapp.fn_restore_integrity_check` | `` | MONITORIA | cron:restore-integrity-check; src/app:1 arquivo(s) |
| `zapp.get_platform_health` | `p_instance_name text, p_days integer` | MONITORIA | src/app:1 arquivo(s) |
| `zapp.get_sla_dashboard` | `p_instance_name text, p_days integer` | MONITORIA | src/app:1 arquivo(s) |
| `zapp.rpc_dashboard_home` | `p_instance text, p_assigned_to text` | MONITORIA | src/app:2 arquivo(s) |
| `zapp.rpc_e2e_cleanup` | `` | MONITORIA | src/app:1 arquivo(s); edge/script:scripts/cleanup-e2e-data.sh,scripts/seed-e2e-contacts.sql,e2e/utils/supabase.ts |
| `zapp.rpc_get_pipeline_health` | `p_instance_name text` | MONITORIA | src/app:1 arquivo(s) |
| `zapp.run_contact_purge` | `` | MONITORIA | src/app:1 arquivo(s) |

### MORTA (9)

| função | args | balde | evidência / motivo |
|---|---|---|---|
| `evo.fn_check_unknown_contact_health` | `` | MORTA | — — _sem cron/trigger/src e sem CREATE no repo (DB-only/drift); verificar no DB antes de arquivar_ |
| `evo.fn_test_normalizer_deep` | `` | MORTA | — — _sem cron/trigger/src e sem CREATE no repo (DB-only/drift); verificar no DB antes de arquivar_ |
| `ops._bf_insert` | `p jsonb, ts bigint` | MORTA | — — _sem cron/trigger/src e sem CREATE no repo (DB-only/drift); verificar no DB antes de arquivar_ |
| `ops.fn_system_health` | `` | MORTA | — — _sem cron/trigger/src e sem CREATE no repo (DB-only/drift); verificar no DB antes de arquivar_ |
| `ops.sim_rls_wa` | `` | MORTA | — — _sem cron/trigger/src e sem CREATE no repo (DB-only/drift); verificar no DB antes de arquivar_ |
| `zapp.fn_contacts_view_delete` | `` | MORTA | — — _sem cron/trigger/src e sem CREATE no repo (DB-only/drift); verificar no DB antes de arquivar_ |
| `zapp.fn_contacts_view_insert` | `` | MORTA | — — _sem cron/trigger/src e sem CREATE no repo (DB-only/drift); verificar no DB antes de arquivar_ |
| `zapp.fn_contacts_view_update` | `` | MORTA | — — _sem cron/trigger/src e sem CREATE no repo (DB-only/drift); verificar no DB antes de arquivar_ |
| `zapp.rpc_reset_conversation_unread` | `p_contact_id uuid, p_instance text` | MORTA | — — _sem cron, sem trigger, sem chamador em src/ nem em edge-functions/scripts_ |

### INDETERMINADA (1)

| função | args | balde | evidência / motivo |
|---|---|---|---|
| `evo.pr_link_msgs_to_conversations` | `IN p_batch integer` | INDETERMINADA | — — _sem cron/trigger/src/chamador no DB; COMMENT ON FUNCTION no repo diz 'Usada em reconciliacao' (uso manual/ferramenta externa possivel)_ |

## Metodologia (reproduzível)

### Fontes de evidência (5 canais de consumidor)

1. **cron** — para cada função `schema.base`, buscou-se `base` (word-boundary, `(?<![A-Za-z0-9_])base(?![A-Za-z0-9_])`) e `schema.base` no campo `cmd` de cada um dos 220 jobs de `crons.json`. Ex.: `alert-ghost-message-events => SELECT zapp.fn_alert_ghost_message_events()`.
2. **trigger (repo)** — grep em `supabase/migrations/*.sql` pelo nome da função com contexto de trigger (`CREATE TRIGGER`, `EXECUTE FUNCTION/PROCEDURE`, `INSTEAD OF`, `RETURNS trigger`) em ±3 linhas.
3. **src/** — grep word-boundary do nome em `src/` (read-only). Separado `src/app` (exclui `__tests__`, `*.test.*`, `*.spec.*`) de `src/test`.
4. **sync-ignore** — `scripts/.sync-ignore` é allowlist curada de funções chamadas pelo frontend via clients EXTERNOS (`externalClient.ts` Bitrix24, `zappweb/supabaseClient.ts`). Presença = consumidor real.
5. **edge/script** — grep word-boundary em `supabase/functions/` (edge functions), `scripts/`, `e2e/`, `ops/`, `db/` (fora de migrations).
6. **DB de produção (read-only, 2026-08-15)** — consultas `pg_trigger`/`pg_proc`/`cron.job` para dirimir candidatos a MORTA: 8 funções sem consumidor no repo estão WIRED como trigger no banco (listadas abaixo).

### Árvore de decisão

```
tem consumidor (cron | trigger | src/ | sync-ignore | edge/script | trigger-DB)?
├─ SIM → nome casa regex de monitoria/ops?  → MONITORIA (alert|monitor|health|check|watchdog|
│        guardrail|drift|probe|sentinel|stall|audit|retention|cleanup|archive|purge|expire|
│        payload|sim_|dashboard|budget|backcompat|partition|reconcil|orphan|gap|e2e_|
│        detect|warmup)
│        senão → NEGOCIO
└─ NÃO → existe no DB como trigger (pg_trigger)?  → NEGOCIO (trigger-DB, evidência medida)
       ├─ nome = pr_link_msgs_to_conversations → INDETERMINADA (doc: 'Usada em reconciliação')
       ├─ nome = messages_instead_of_delete   → INDETERMINADA (trigger INSTEAD OF DELETE provável no DB)
       ├─ sem CREATE no repo (DB-only/drift)  → MORTA (verificar no DB antes de arquivar)
       └─ senão                               → MORTA (sem cron/trigger/src/edge)
```

### Queries/greps exatos usados

```bash
# (1) cron — 220 jobs de .hermes/fase3/crons.json, regex por função:
python - <<'PY'
import json,re
crons=json.load(open('.hermes/fase3/crons.json'))
rx=re.compile(r'(?<![A-Za-z0-9_])fn_x(?![A-Za-z0-9_])')
hits=[e['job'] for e in crons if rx.search(e['cmd'] or '')]
PY
# (2) trigger no repo:
grep -rn -E 'CREATE (OR REPLACE )?TRIGGER|EXECUTE (FUNCTION|PROCEDURE)|INSTEAD OF|RETURNS trigger' \
      supabase/migrations/*.sql | grep <nome>   # ±3 linhas de contexto
# (3) src (read-only):
grep -rln '<nome>' src/           # src/app (fora de __tests__/*.test.*/*.spec.*)
# (4) sync-ignore:
grep -x '<nome>' scripts/.sync-ignore
# (5) edge/script:
grep -rln '<nome>' supabase/functions/ scripts/ e2e/ ops/ db/
```

### Consultas ao banco (read-only, usadas para dirimir os candidatos a MORTA)

```sql
-- (6a) triggers que usam funções candidatas:
SELECT n.nspname AS schema, p.proname AS fn, t.tgname AS trigger_name,
       c.relname AS tbl, t.tgtype
FROM pg_trigger t
JOIN pg_proc p      ON p.oid = t.tgfoid
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_class c     ON c.oid = t.tgrelid
WHERE p.proname IN ('fn_normalize_conversation_jid','fn_normalize_remote_jid',
      'fn_sync_status_from_messages','fn_touch_contact_last_message',
      'auto_assign_to_queue_agent_sh','fn_auto_save_received_sticker',
      'messages_instead_of_delete','fn_contacts_view_update_handler', …)
  AND NOT t.tgisinternal;

-- (6b) chamadores dentro de outras funções (prosrc ILIKE '%<nome>%'):
SELECT n.nspname, p.proname, p.prosrc FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosrc ILIKE '%<nome>%' AND p.proname <> '<nome>';

-- (6c) cron do banco (confirma crons.json):
SELECT jobname, command FROM cron.job WHERE command ILIKE '%<nome>%';
```

### Resultado da verificação no banco (2026-08-15)

8 funções sem consumidor no repo estão **wired como trigger em produção** e foram reclassificadas NEGOCIO (evidência `trigger-DB`):

| função | trigger | tabela | tipo |
|---|---|---|---|
| `evo.fn_normalize_conversation_jid` | trg_normalize_conversation_jid | evo.evolution_conversations_wpp2 | BEFORE INSERT OR UPDATE |
| `evo.fn_normalize_remote_jid` | trg_normalize_remote_jid | evo.evolution_messages_wpp2 | BEFORE INSERT OR UPDATE |
| `evo.fn_sync_status_from_messages` | trg_sync_status_to_dedicated | evo.evolution_messages_wpp2 | BEFORE INSERT |
| `evo.fn_touch_contact_last_message` | trg_touch_contact_last_message | evo.evolution_messages_wpp2 | BEFORE INSERT |
| `zapp.auto_assign_to_queue_agent_sh` | on_contact_queue_auto_assign | zapp.evolution_contacts | BEFORE INSERT OR UPDATE |
| `zapp.fn_auto_save_received_sticker` | trg_auto_save_sticker_wpp2 | evo.evolution_messages_wpp2 | BEFORE INSERT |
| `zapp.messages_instead_of_delete` | messages_instead_of_delete_tg | zapp.messages | INSTEAD OF DELETE |
| `zapp.fn_contacts_view_update_handler` | trg_contacts_view_update | zapp.contacts | INSTEAD OF UPDATE |

Todas as 160 funções existem no banco (pg_proc). Nenhuma das 9 MORTA tem trigger, cron ou chamador no banco/repo.

## Verificação (contagens)

- Total classificado: **160** (entradas de physrefs.json)
- **NEGOCIO**: 111
- **MONITORIA**: 39
- **MORTA**: 9
- **INDETERMINADA**: 1

> Regra da onda: NADA é dropado nesta etapa. MORTA/INDETERMINADA são candidatas a arquivamento na E50, após verificação no banco (todas as 9 MORTA são DB-only/drift ou sem CREATE no repo — nenhuma tem DDL de drop aqui).
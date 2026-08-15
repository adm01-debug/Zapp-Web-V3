# PHYS_REFS_MAP — Mapa das 160 Referências Físicas às Tabelas da Evolution (E67)

**Data:** 2026-08-15
**Etapa do plano:** E67 (FASE 5 — Reposicionar o dado e a leitura)
**Fonte de dados:** `.hermes/fase3/physrefs.json` (160 funções), `.hermes/fase3/dados-reais.json` (contagens), `.hermes/fase3/crons.json` (cross-ref de cron)
**Artefato:** mapa documental — nenhuma DDL/função foi alterada (onda CI + docs + análise).

---

## 1. Objetivo

Medir o **custo real** do E73 (`ALTER TABLE zapp.evolution_messages SET SCHEMA evo` + `conversations`): quantas funções citam as tabelas físicas `zapp.evolution_messages`, `zapp.evolution_contacts` e `zapp.evolution_conversations` **pelo nome**, em qual schema vivem e qual categoria de uso representam.

Este mapa alimenta a sequência **E68–E71 (indireção por view antes do SET SCHEMA)**:

| Etapa | Ação | Meta |
|---|---|---|
| **E68** | Camada de indireção: funções passam a acessar via `public.<tabela>` (view), não pelo nome físico | 160 → 0 referências físicas |
| **E69** | Reescrever as 160 em lotes, com teste de contrato por lote | `boundary-audit --phys-refs` = 0 |
| **E70** | Repontar cron jobs que citam as tabelas por nome | Query = 0 |
| **E71** | Gate de CI: migration que cite `zapp.evolution_messages` direto falha | Guard testado |
| **E73** | `SET SCHEMA` das tabelas para `evo` (catálogo; partições acompanham a raiz) | `pg_class.relnamespace` = `evo` |

**Regra de ouro (trava dura do plano):** E68–E71 **antes** de E73 — sem a indireção, E73 quebra as 160 funções (risco C1 do plano).

---

## 2. QUERY REPRODUZÍVEL

A lista foi gerada com a seguinte consulta sobre o catálogo do Postgres (produção self-hosted):

```sql
SELECT n.nspname||'.'||p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE (p.prosrc ILIKE '%zapp.evolution_messages%'
   OR p.prosrc ILIKE '%zapp.evolution_contacts%'
   OR p.prosrc ILIKE '%zapp.evolution_conversations%')
ORDER BY 1;
```

> **Atenção:** a query casa **substring** em `prosrc` — uma função é contada se o corpo citar qualquer uma das 3 tabelas, inclusive em comentários/strings. É uma medição **conservadora** (superconjunto do que quebra de fato), adequada para dimensionar o esforço de reescrita.

---

## 3. Contagens reais

| Métrica | Valor |
|---|---|
| Total de referências físicas (linhas em `physrefs.json`) | **160** |
| Nomes qualificados distintos (156) + overloads (4 pares) | 160 linhas |
| Distribuição por schema | `zapp`=108 · `evo`=38 · `ops`=11 · `public`=3 |
| Soma | 108 + 38 + 11 + 3 = **160** ✓ |

**Delta vs. plano:** o plano E67 estimava **161** funções; a medição real aponta **160** (1 a menos — provável função corrigida/removida entre a escrita do plano e a medição, ou contagem de overloads diferente). O número **160** (dados reais) é o que vale para E68–E71.

**Overloads (mesmo nome, assinaturas diferentes — contadas como 2 linhas cada):**

| Função | Assinaturas |
|---|---|
| `zapp.rpc_get_contact` | `(p_contact_id uuid)` · `(p_remote_jid text, p_instance text)` |
| `public.rpc_get_contact` | `(p_contact_id uuid)` · `(p_remote_jid text, p_instance text)` |
| `zapp.rpc_global_search` | `(p_query text, p_limit integer, p_instance text)` · `(p_query text, p_instance text, p_limit integer)` |
| `zapp.rpc_mark_messages_read` | `(p_contact_id uuid, p_instance text)` · `(p_conversation_id uuid)` |

---

## 4. Distribuição por schema

| Schema | Funções | % do total | Observação |
|---|---:|---:|---|
| `zapp` | **108** | 67,5% | onde vivem as RPCs e triggers do app; 7 chamadas por cron |
| `evo` | **38** | 23,8% | maioria chamada por cron (21) — manutenção do pipeline Evolution |
| `ops` | **11** | 6,9% | vigilância/guarda-corpos; 6 chamadas por cron |
| `public` | **3** | 1,9% | camada de API (RPCs de leitura) |
| **Total** | **160** | 100% | |

---

## 5. Classificação por categoria

Regras de classificação (aplicadas por script Python sobre `physrefs.json` + `crons.json`, sem julgamento manual):

| Categoria | Regra |
|---|---|
| `cron` | nome da função aparece como chamada em `cmd` de algum job de `crons.json` (cross-ref) |
| `trigger` | nome contém `instead_of`/`trigger`, ou é handler de view (`fn_*_view_insert/update/delete[_handler]`) — exceção: `evo.fn_trigger_audio_transcription` (processor de cron, não trigger) |
| `leitura` | nome casa `get_*`, `rpc_list_*`, `rpc_get_*`, `rpc_search_*`, `search_*`, contém `search`/`_preview_`, ou é `rpc_message_stats`/`rpc_dashboard_home` (agregações) |
| `rpc_escrita` | prefixo `rpc_*` que **não** caiu em leitura (escrita via PostgREST) |
| `outro` | demais funções internas de escrita/manutenção (`fn_*`, `send_*`, `merge_*`, `update_*`, `bulk_*`, ...) |

As categorias são **mutuamente exclusivas** (precedência `cron` > `trigger` > `leitura` > `rpc_escrita` > `outro`); a soma fecha exatamente 160, sem sobreposição.

### 5.1 Contagens totais por categoria

| Categoria | Funções | % do total |
|---|---:|---:|
| `cron` (chamadas por cron job) | **34** | 21,3% |
| `trigger` (INSTEAD OF / handlers de view / trigger de update) | **10** | 6,3% |
| `leitura` (get_*/rpc_list_*/rpc_get_*/search_*/agregações) | **36** | 22,5% |
| `rpc_escrita` (RPCs de escrita via PostgREST) | **23** | 14,4% |
| `outro` (funções internas de escrita/manutenção) | **57** | 35,6% |
| **Total** | **160** | 100% |

### 5.2 Matriz categoria × schema

| Schema | cron | trigger | leitura | rpc_escrita | outro | Total |
|---|---:|---:|---:|---:|---:|---:|
| `zapp` | 7 | 10 | 33 | 22 | 36 | 108 |
| `evo` | 21 | 0 | 1 | 1 | 15 | 38 |
| `ops` | 6 | 0 | 0 | 0 | 5 | 11 |
| `public` | 0 | 0 | 2 | 0 | 1 | 3 |
| **Total** | **34** | **10** | **36** | **23** | **57** | **160** |

---

## 6.1 Funções do schema `zapp` (108)

| # | Função | Categoria | Assinatura |
|---|---|---|---|
| 1 | `zapp.fn_archive_old_wpp2_messages` | `cron` | `p_months_old integer, p_batch_size integer` |
| 2 | `zapp.fn_check_evolution_jid_health` | `cron` | `—` |
| 3 | `zapp.fn_check_evolution_pipeline_health` | `cron` | `—` |
| 4 | `zapp.fn_cron_guardian` | `cron` | `—` |
| 5 | `zapp.fn_queue_autoassign_tick` | `cron` | `p_limit integer` |
| 6 | `zapp.fn_restore_integrity_check` | `cron` | `—` |
| 7 | `zapp.fn_retry_stuck_messages` | `cron` | `—` |
| 8 | `zapp.fn_contacts_view_delete` | `trigger` | `—` |
| 9 | `zapp.fn_contacts_view_delete_handler` | `trigger` | `—` |
| 10 | `zapp.fn_contacts_view_insert` | `trigger` | `—` |
| 11 | `zapp.fn_contacts_view_insert_handler` | `trigger` | `—` |
| 12 | `zapp.fn_contacts_view_update` | `trigger` | `—` |
| 13 | `zapp.fn_contacts_view_update_handler` | `trigger` | `—` |
| 14 | `zapp.fn_messages_instead_of_insert` | `trigger` | `—` |
| 15 | `zapp.fn_messages_view_insert_handler` | `trigger` | `—` |
| 16 | `zapp.messages_instead_of_delete` | `trigger` | `—` |
| 17 | `zapp.messages_update_trigger` | `trigger` | `—` |
| 18 | `zapp.contacts_count_by_type` | `leitura` | `—` |
| 19 | `zapp.get_companies_by_phones_batch` | `leitura` | `p_phones text[]` |
| 20 | `zapp.get_compliance_metrics` | `leitura` | `snapshot_time timestamp without time zone` |
| 21 | `zapp.get_compliance_metrics_v2` | `leitura` | `—` |
| 22 | `zapp.get_contact_360_by_phone` | `leitura` | `p_phone text, p_instance text` |
| 23 | `zapp.get_contact_conversations` | `leitura` | `p_contact_id uuid, p_limit integer` |
| 24 | `zapp.get_contact_intelligence_by_phone` | `leitura` | `p_phone text` |
| 25 | `zapp.get_contact_stats` | `leitura` | `p_instance_name text` |
| 26 | `zapp.get_contacts_360_batch` | `leitura` | `p_phones text[]` |
| 27 | `zapp.get_conversations_safe_join` | `leitura` | `—` |
| 28 | `zapp.get_duplicate_report` | `leitura` | `p_instance_name text` |
| 29 | `zapp.get_lgpd_compliance_stats` | `leitura` | `p_instance_name text` |
| 30 | `zapp.get_platform_health` | `leitura` | `p_instance_name text, p_days integer` |
| 31 | `zapp.get_segment_contacts` | `leitura` | `p_segment_id uuid, p_limit integer, p_offset integer` |
| 32 | `zapp.get_sla_dashboard` | `leitura` | `p_instance_name text, p_days integer` |
| 33 | `zapp.rpc_dashboard_home` | `leitura` | `p_instance text, p_assigned_to text` |
| 34 | `zapp.rpc_get_contact` | `leitura` | `p_contact_id uuid` |
| 35 | `zapp.rpc_get_contact` | `leitura` | `p_remote_jid text, p_instance text` |
| 36 | `zapp.rpc_get_message_details` | `leitura` | `p_message_id uuid` |
| 37 | `zapp.rpc_get_pipeline_health` | `leitura` | `p_instance_name text` |
| 38 | `zapp.rpc_global_search` | `leitura` | `p_query text, p_limit integer, p_instance text` |
| 39 | `zapp.rpc_global_search` | `leitura` | `p_query text, p_instance text, p_limit integer` |
| 40 | `zapp.rpc_inbox_preview_batch` | `leitura` | `p_remote_jids text[], p_instance text, p_limit integer` |
| 41 | `zapp.rpc_list_contact_links` | `leitura` | `p_contact_id uuid, p_limit integer` |
| 42 | `zapp.rpc_list_contacts` | `leitura` | `p_instance text, p_lead_status text, p_assigned_to text, p_search text, p_limit integer, p_offset integer` |
| 43 | `zapp.rpc_list_conversations` | `leitura` | `p_instance text, p_status text, p_assigned_to text, p_limit integer, p_offset integer` |
| 44 | `zapp.rpc_list_messages` | `leitura` | `p_remote_jid text, p_instance text, p_limit integer, p_before_date timestamp with time zone` |
| 45 | `zapp.rpc_list_messages_all` | `leitura` | `p_instance text, p_contact_id uuid, p_conversation_id uuid, p_direction text, p_message_type text, p_search text, p_limit integer, p_offset integer` |
| 46 | `zapp.rpc_list_messages_lite` | `leitura` | `p_remote_jid text, p_instance text, p_limit integer, p_offset integer, p_before_date timestamp with time zone` |
| 47 | `zapp.rpc_message_stats` | `leitura` | `p_instance text, p_days_back integer, p_assigned_to text` |
| 48 | `zapp.rpc_search_messages` | `leitura` | `p_query text, p_instance text, p_limit integer` |
| 49 | `zapp.rpc_unified_search` | `leitura` | `p_query text, p_limit integer` |
| 50 | `zapp.search_contacts_advanced` | `leitura` | `p_search text, p_vendedor text, p_ramo text, p_rfm_segment text, p_estado text, p_cliente_ativado boolean, p_ja_comprou boolean, p_sort_by text, p_page integer, p_page_size integer` |
| 51 | `zapp.rpc_backfill_messages_contact_id` | `rpc_escrita` | `p_instance_name text, p_batch_size integer, p_dry_run boolean` |
| 52 | `zapp.rpc_bulk_repair_dedup_hashes` | `rpc_escrita` | `p_instance_name text, p_batch_size integer, p_dry_run boolean` |
| 53 | `zapp.rpc_claim_outbound_message` | `rpc_escrita` | `p_row_id uuid, p_message_id text, p_status text` |
| 54 | `zapp.rpc_delete_contact` | `rpc_escrita` | `p_remote_jid text, p_instance text, p_performed_by text` |
| 55 | `zapp.rpc_delete_message` | `rpc_escrita` | `p_id uuid` |
| 56 | `zapp.rpc_e2e_cleanup` | `rpc_escrita` | `—` |
| 57 | `zapp.rpc_insert_message` | `rpc_escrita` | `p_remote_jid text, p_content text, p_instance text, p_message_id text, p_from_me boolean, p_direction text, p_message_type text, p_media_url text, p_metadata jsonb, p_provider text, p_timestamp timestamp with time zone, p_contact_id uuid, p_quoted_message_id text, p_caption text, p_ingest_meta jsonb, p_media_meta jsonb, p_media_bucket text, p_media_path text, p_media_status text, p_status_at timestamp with time zone, p_push_name text` |
| 58 | `zapp.rpc_mark_conversation_read` | `rpc_escrita` | `p_id uuid` |
| 59 | `zapp.rpc_mark_messages_as_read` | `rpc_escrita` | `p_contact_id uuid` |
| 60 | `zapp.rpc_mark_messages_deleted` | `rpc_escrita` | `p_contact_id uuid, p_instance text` |
| 61 | `zapp.rpc_mark_messages_read` | `rpc_escrita` | `p_conversation_id uuid` |
| 62 | `zapp.rpc_mark_messages_read` | `rpc_escrita` | `p_contact_id uuid, p_instance text` |
| 63 | `zapp.rpc_reset_conversation_unread` | `rpc_escrita` | `p_contact_id uuid, p_instance text` |
| 64 | `zapp.rpc_resolve_instance_by_phone` | `rpc_escrita` | `p_phone text` |
| 65 | `zapp.rpc_resolve_whatsapp_instance` | `rpc_escrita` | `p_contact_id uuid` |
| 66 | `zapp.rpc_schedule_follow_up` | `rpc_escrita` | `p_message_id uuid, p_follow_up_at timestamp with time zone, p_follow_up_done boolean` |
| 67 | `zapp.rpc_send_sticker` | `rpc_escrita` | `p_contact_id uuid, p_sticker_url text, p_instance_name text, p_sticker_id uuid, p_created_by uuid` |
| 68 | `zapp.rpc_toggle_message_important` | `rpc_escrita` | `p_message_id uuid, p_value boolean` |
| 69 | `zapp.rpc_toggle_message_star` | `rpc_escrita` | `p_message_id uuid, p_value boolean` |
| 70 | `zapp.rpc_update_incoming_message` | `rpc_escrita` | `p_row_id uuid, p_contact_id uuid, p_content text, p_message_type text, p_media_url text, p_media_bucket text, p_media_path text, p_media_status text, p_from_me boolean, p_direction text, p_status text, p_ingest_meta jsonb, p_quoted_message_id text` |
| 71 | `zapp.rpc_update_message_transcription` | `rpc_escrita` | `p_message_uuid uuid, p_status text, p_transcription text` |
| 72 | `zapp.rpc_upsert_contact` | `rpc_escrita` | `p_remote_jid text, p_instance text, p_push_name text, p_full_name text, p_phone_number text, p_email text, p_company text, p_role_title text, p_lead_status text, p_lead_source text, p_lead_score integer, p_assigned_to text, p_tags text[], p_notes text` |
| 73 | `zapp.anonymize_contacts_batch` | `outro` | `contact_ids uuid[]` |
| 74 | `zapp.auto_assign_to_queue_agent_sh` | `outro` | `—` |
| 75 | `zapp.bulk_auto_merge_duplicates` | `outro` | `p_instance_name text, p_limit integer` |
| 76 | `zapp.bulk_soft_delete_contacts` | `outro` | `p_contact_ids uuid[], p_reason text` |
| 77 | `zapp.bulk_update_lead_status` | `outro` | `p_contact_ids uuid[], p_status text` |
| 78 | `zapp.delete_contact_completely` | `outro` | `p_contact_id uuid` |
| 79 | `zapp.find_duplicate_contacts` | `outro` | `p_workspace_id text, p_limit integer` |
| 80 | `zapp.fn_audit_checksum_head_tail` | `outro` | `—` |
| 81 | `zapp.fn_audit_checksum_messagetimestamp` | `outro` | `—` |
| 82 | `zapp.fn_audit_sample_match` | `outro` | `—` |
| 83 | `zapp.fn_auto_save_received_sticker` | `outro` | `—` |
| 84 | `zapp.fn_enqueue_message_dispatch` | `outro` | `p_message_id uuid, p_instance text` |
| 85 | `zapp.fn_get_evolution_health_summary` | `outro` | `—` |
| 86 | `zapp.fn_handle_whatsapp_status` | `outro` | `p_payload jsonb, p_instance text` |
| 87 | `zapp.fn_lgpd_anonymize_deleted_contacts` | `outro` | `p_days_threshold integer` |
| 88 | `zapp.fn_lgpd_purge_message_metadata` | `outro` | `p_days_threshold integer` |
| 89 | `zapp.fn_message_rate_5min` | `outro` | `—` |
| 90 | `zapp.fn_normalize_send_jid` | `outro` | `p_jid text, p_instance text` |
| 91 | `zapp.fn_process_contacts_batch` | `outro` | `p_contacts jsonb, p_instance text` |
| 92 | `zapp.fn_process_message_edited` | `outro` | `p_payload jsonb, p_instance text` |
| 93 | `zapp.fn_process_whatsapp_message` | `outro` | `p_payload jsonb, p_instance text` |
| 94 | `zapp.fn_register_instance` | `outro` | `p_instance_name character varying, p_display_name character varying, p_phone character varying, p_department character varying, p_responsible character varying` |
| 95 | `zapp.fn_webhook_pipeline_score` | `outro` | `p_eff_state text` |
| 96 | `zapp.fn_zapp_web_smoke_test_v2` | `outro` | `—` |
| 97 | `zapp.grant_lgpd_consent` | `outro` | `p_contact_id uuid, p_channel text, p_marketing_consent boolean, p_data_sharing boolean, p_profiling boolean` |
| 98 | `zapp.mark_follow_up_done` | `outro` | `p_message_id uuid` |
| 99 | `zapp.merge_contacts` | `outro` | `p_primary_id uuid, p_secondary_id uuid, p_merged_fields jsonb` |
| 100 | `zapp.populate_contact_intelligence_batch` | `outro` | `p_batch_size integer, p_offset integer` |
| 101 | `zapp.revoke_lgpd_consent` | `outro` | `p_contact_id uuid, p_reason text` |
| 102 | `zapp.run_contact_purge` | `outro` | `—` |
| 103 | `zapp.send_message_v2` | `outro` | `p_remote_jid text, p_content text, p_message_type text, p_media_url text, p_media_mimetype text, p_instance text` |
| 104 | `zapp.sync_interaction_from_zapp` | `outro` | `p_phone text, p_channel text, p_direction text, p_assunto text, p_resumo text, p_conteudo text, p_sentiment text, p_message_count integer, p_duration_seconds integer, p_agent_name text, p_zapp_conversation_id text` |
| 105 | `zapp.sync_tag_use_counts` | `outro` | `—` |
| 106 | `zapp.update_contact_versioned` | `outro` | `p_contact_id uuid, p_expected_version integer, p_updates jsonb` |
| 107 | `zapp.upsert_contact_intelligence` | `outro` | `p_contact_id uuid` |
| 108 | `zapp.zapp_isonwa_mark` | `outro` | `p_jids text[], p_ok_jids text[]` |

## 6.2 Funções do schema `evo` (38)

| # | Função | Categoria | Assinatura |
|---|---|---|---|
| 1 | `evo.fn_alert_ghost_conversations` | `cron` | `—` |
| 2 | `evo.fn_apply_lid_mappings` | `cron` | `p_dry_run boolean, p_batch integer` |
| 3 | `evo.fn_backfill_contact_id` | `cron` | `p_batch integer` |
| 4 | `evo.fn_cache_warmup_after_vacuum` | `cron` | `—` |
| 5 | `evo.fn_check_ack_stall` | `cron` | `—` |
| 6 | `evo.fn_detect_dedup_cap_failures` | `cron` | `p_window interval` |
| 7 | `evo.fn_e2e_media_probe` | `cron` | `p_window_hours integer` |
| 8 | `evo.fn_enqueue_orphan_media` | `cron` | `p_limit integer, p_days_back integer` |
| 9 | `evo.fn_ensure_evolution_backcompat_views` | `cron` | `—` |
| 10 | `evo.fn_expire_whatsapp_media_urls` | `cron` | `p_days_old integer, p_batch_limit integer` |
| 11 | `evo.fn_handle_expired_r2_media` | `cron` | `—` |
| 12 | `evo.fn_lid_regression_suite` | `cron` | `—` |
| 13 | `evo.fn_link_orphan_messages` | `cron` | `p_limit integer` |
| 14 | `evo.fn_monitor_lid_contamination` | `cron` | `—` |
| 15 | `evo.fn_monthly_evo_audit` | `cron` | `—` |
| 16 | `evo.fn_passive_lid_accumulator` | `cron` | `p_lookback_hours integer` |
| 17 | `evo.fn_pipeline_health_probe` | `cron` | `—` |
| 18 | `evo.fn_repontar_filhas_graveyard` | `cron` | `p_dry_run boolean` |
| 19 | `evo.fn_sync_messages_to_v2` | `cron` | `—` |
| 20 | `evo.fn_trigger_audio_transcription` | `cron` | `p_batch_size integer` |
| 21 | `evo.fn_update_instance_health` | `cron` | `—` |
| 22 | `evo.search_contacts_gin` | `leitura` | `p_query text, p_limit integer, p_offset integer, p_min_sim double precision` |
| 23 | `evo.rpc_complete_media_download` | `rpc_escrita` | `p_queue_id bigint, p_download_url text, p_storage_path text` |
| 24 | `evo.fn_check_unknown_contact_health` | `outro` | `—` |
| 25 | `evo.fn_cleanup_test_artifacts` | `outro` | `p_confirm boolean, p_max_age_hours integer` |
| 26 | `evo.fn_delete_test_contacts` | `outro` | `p_pattern text` |
| 27 | `evo.fn_normalize_conversation_jid` | `outro` | `—` |
| 28 | `evo.fn_normalize_remote_jid` | `outro` | `—` |
| 29 | `evo.fn_notify_sicoob_on_reply` | `outro` | `—` |
| 30 | `evo.fn_post_upgrade_verify` | `outro` | `p_timeout_minutes integer` |
| 31 | `evo.fn_prepare_lid_dedup` | `outro` | `p_dry_run boolean, p_instance text, p_batch_size integer` |
| 32 | `evo.fn_purge_lid_orphan_messages_batch` | `outro` | `p_batch_size integer` |
| 33 | `evo.fn_resolve_contact_id_by_jid` | `outro` | `p_jid text` |
| 34 | `evo.fn_sync_status_from_messages` | `outro` | `—` |
| 35 | `evo.fn_test_normalizer_deep` | `outro` | `—` |
| 36 | `evo.fn_touch_contact_last_message` | `outro` | `—` |
| 37 | `evo.fn_touch_contact_presence` | `outro` | `p_remote_jid text, p_presence text, p_instance text` |
| 38 | `evo.pr_link_msgs_to_conversations` | `outro` | `IN p_batch integer` |

## 6.3 Funções do schema `ops` (11)

| # | Função | Categoria | Assinatura |
|---|---|---|---|
| 1 | `ops.check_marketing_budget` | `cron` | `—` |
| 2 | `ops.fn_alert_consumer_halt` | `cron` | `—` |
| 3 | `ops.fn_check_view_column_drift` | `cron` | `—` |
| 4 | `ops.fn_guardrails_check` | `cron` | `—` |
| 5 | `ops.fn_monitor_ingestion_persistence_gap` | `cron` | `p_window interval, p_min_upserts integer, p_degraded_ratio numeric, p_cooldown interval` |
| 6 | `ops.fn_payload_retention` | `cron` | `p_days integer, p_dry_run boolean` |
| 7 | `ops._bf_insert` | `outro` | `p jsonb, ts bigint` |
| 8 | `ops.fn_dashboard` | `outro` | `—` |
| 9 | `ops.fn_system_health` | `outro` | `—` |
| 10 | `ops.sim_rls_wa` | `outro` | `—` |
| 11 | `ops.sim_wa_budget_guard` | `outro` | `—` |

## 6.4 Funções do schema `public` (3)

| # | Função | Categoria | Assinatura |
|---|---|---|---|
| 1 | `public.rpc_get_contact` | `leitura` | `p_contact_id uuid` |
| 2 | `public.rpc_get_contact` | `leitura` | `p_remote_jid text, p_instance text` |
| 3 | `public.set_audio_transcription` | `outro` | `p_message_id text, p_transcription text, p_status text, p_error_code text, p_error_reason text` |

---

## 7. Cross-ref com crons.json

### 7.1 Funções chamadas por cron (34) — precisam continuar funcionando após E73

| Função | Job(s) de cron |
|---|---|
| `evo.fn_monitor_lid_contamination` | lid-contamination-daily |
| `evo.fn_alert_ghost_conversations` | ghost-conversations-daily-alert |
| `evo.fn_check_ack_stall` | check_ack_stall |
| `evo.fn_detect_dedup_cap_failures` | evo-dedup-cap-monitor |
| `evo.fn_e2e_media_probe` | e2e-media-probe-daily, e2e-media-probe-hourly |
| `evo.fn_enqueue_orphan_media` | enqueue-orphan-media-hourly |
| `evo.fn_ensure_evolution_backcompat_views` | ensure-evolution-backcompat-views |
| `evo.fn_expire_whatsapp_media_urls` | expire-whatsapp-media-1h |
| `evo.fn_handle_expired_r2_media` | sync-r2-lifecycle |
| `evo.fn_link_orphan_messages` | link-orphan-messages |
| `evo.fn_monthly_evo_audit` | monthly-evo-audit |
| `evo.fn_sync_messages_to_v2` | evo-sync-messages-to-v2 |
| `evo.fn_update_instance_health` | evo-instance-health-check |
| `ops.check_marketing_budget` | daily-wa-marketing-budget |
| `ops.fn_alert_consumer_halt` | alert-consumer-halt |
| `ops.fn_check_view_column_drift` | view-column-drift-guard |
| `ops.fn_guardrails_check` | ops-guardrails-deadman |
| `ops.fn_monitor_ingestion_persistence_gap` | monitor-ingestion-persistence-gap |
| `ops.fn_payload_retention` | ops-payload-retention |
| `zapp.fn_archive_old_wpp2_messages` | archive-old-wpp2-messages |
| `zapp.fn_check_evolution_jid_health` | evolution-jid-health-check-5min |
| `zapp.fn_restore_integrity_check` | restore-integrity-check |
| `zapp.fn_retry_stuck_messages` | retry-stuck-messages |
| `evo.fn_apply_lid_mappings` | lid-phonejid-emergence-watchdog |
| `evo.fn_backfill_contact_id` | backfill-contact-id-ongoing |
| `zapp.fn_check_evolution_pipeline_health` | evolution-pipeline-health-check-bateria10 |
| `evo.fn_cache_warmup_after_vacuum` | cache-warmup-after-vacuum |
| `evo.fn_passive_lid_accumulator` | lid-passive-accumulator, lid-phonejid-emergence-watchdog |
| `evo.fn_repontar_filhas_graveyard` | repontar-filhas-graveyard |
| `zapp.fn_cron_guardian` | cron-guardian |
| `zapp.fn_queue_autoassign_tick` | queue-autoassign-tick |
| `evo.fn_pipeline_health_probe` | evolution-pipeline-probe-15min |
| `evo.fn_lid_regression_suite` | lid-regression-suite-2h |
| `evo.fn_trigger_audio_transcription` | audio-transcription-trigger |

### 7.2 Cron jobs que citam as tabelas físicas **pelo nome** (escopo E70: 7 jobs)

| Job | Tabelas citadas no `cmd` |
|---|---|
| analyze-catalogo-diario | `evolution_contacts`, `evolution_messages` |
| evo-repopula-fila-isonwa | `evolution_contacts` |
| evo-schema-guardian-monthly | `evolution_contacts`, `evolution_messages` |
| lid-phonejid-emergence-watchdog | `evolution_contacts` |
| pipeline-canary-keep-alive | `evolution_messages` |
| vacuum-contacts-2h | `evolution_contacts` |
| vacuum-messages-2h | `evolution_messages` |

> O plano estimava **6** jobs; a medição sobre `crons.json` atual encontra **7** (o job `pipeline-canary-keep-alive` ou a contagem evoluiu desde a escrita do plano). Escopo E70 = repontar os 7.

---

## 8. Implicação para E73 (`SET SCHEMA`)

**As 160 funções precisam de reescrita do corpo** (trocar a referência física `zapp.evolution_*` pela view de indireção `public.evolution_*` criada em E68). Nenhuma execução foi feita — o número por categoria é o esforço real de E69:

| Categoria | Reescrita necessária | Riscos específicos |
|---|---:|---|
| `cron` (34) | corpo + **repontar job** se citar tabela por nome | 7 jobs citam por nome (E70); `fn_restore_integrity_check` é DR (NÃO MEXA sem revisão sênior) |
| `trigger` (10) | corpo dos handlers INSTEAD OF / triggers de view | são o **mecanismo da indireção**: reescrever junto com a view de E68, na mesma migration; `fn_ensure_evolution_backcompat_views` e views de compat seguem a regra 'NÃO MEXA' (alterar allowlist, nunca a view avulsa) |
| `leitura` (36) | corpo (FROM/join passam a usar a view) | RPCs expostas (PostgREST): contrato de saída não pode mudar — teste de contrato por lote (E69) |
| `rpc_escrita` (23) | corpo (INSERT/UPDATE via view com INSTEAD OF) | dependem dos handlers INSTEAD OF reescritos primeiro (ordem: views → handlers → RPCs) |
| `outro` (57) | corpo | funções `SECURITY DEFINER` exigem `search_path` fixo — conferir em cada reescrita |
| **Total** | **160** | ordem sugerida de E69: triggers/handlers (10) → leituras (36) → rpc_escrita (23) → cron (34) → outro (57) |

**Ponto de não-retorno:** se E73 rodar sem E68–E71, quebram: 10 triggers (writes via view do app param), 36 leituras + 23 RPCs de escrita (app ZAPP Web), 34 funções de cron (alertas/watchdogs) e 57 internas — **160 no total**, com 7 cron jobs falhando por nome explícito.

---

## 9. Verificação

1. `physrefs.json` lido integralmente (641 linhas): 160 entradas, 4 pares de overloads (156 nomes distintos).
2. Contagens por schema conferidas com `dados-reais.json` → `phys_refs_count`: zapp=108, evo=38, ops=11, public=3, total=160. **Conferem.**
3. Classificação por script Python (regras da seção 5) sobre `physrefs.json` + `crons.json`: soma das categorias = 160 (sem sobreposição).
4. Cross-ref de cron: 34 funções ↔ 35 jobs; 7 jobs citam tabelas por nome (escopo E70).
5. Nenhuma DDL/função executada — artefato 100% documental (regra 3 do worker-rules).

## 10. Suposições e limitações

- Contagem é **por corpo de função** (`prosrc` ILIKE): 1 linha por função/assinatura, não por ocorrência da tabela dentro do corpo.
- A query casa substring: comentários/strings podem inflar; tratamos como superconjunto conservador.
- `public.set_audio_transcription` e `ops._bf_insert`/`sim_*` estão na lista porque seus corpos citam as tabelas — serão reescritos como os demais.
- Delta plano (161) × medição (160): documentado na seção 3, sem ação.

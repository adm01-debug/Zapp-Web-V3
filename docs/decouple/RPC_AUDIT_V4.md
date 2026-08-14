# RPC_AUDIT_V4 — Auditoria de RPCs de escrita/ingestão (domínio evolution) + dispatch_error_logs

- **Data**: 2026-08-14
- **Mandato**: V4-FINAL #78–79 (AGENTE 7) — APENAS SELECTs (read-only)
- **Fonte**: pg_proc / information_schema / cron.job via MCP SQL (`mcp__supabase__supabase_db_query`) no Supabase self-hosted (supabase.atomicabr.com.br)
- **Filtro do escopo**: schemas `zapp`/`evo`, `proname LIKE 'rpc\_%' OR 'fn\_%'` e `proname ~* 'message|contact|conversation|inbox|outbound'`

---

## (a) Overloads em pg_proc — meta: 1 overload ativo por RPC

**Totais**: 121 pronames distintos / 124 linhas em pg_proc. Sem shadowing entre schemas (nenhum proname existe em `zapp` E `evo` simultaneamente).

| Status | Qtd pronames | Qtd linhas pg_proc |
|---|---|---|
| OK (1 overload) | 118 | 118 |
| DRIFT (2 overloads) | 3 | 6 |
| **Total** | **121** | **124** |

### DRIFT — 3 pronames com 2 overloads (meta violada)

| Schema | proname | OIDs | Assinaturas |
|---|---|---|---|
| zapp | `fn_compute_contact_dedup_hash` | 548932, 548933 | `(p_phone text, p_email text, p_name text)` / `(p_phone_number text, p_email text)` |
| zapp | `rpc_get_contact` | 961345, 1612295 | `(p_contact_id uuid)` / `(p_remote_jid text, p_instance text)` |
| zapp | `rpc_mark_messages_read` | 1624537, 1628787 | `(p_conversation_id uuid)` / `(p_contact_id uuid, p_instance text)` |

> Ação sugerida (NÃO executada — mandato read-only): consolidar 1 overload por proname seguindo o protocolo E15 do V4-FINAL (verificar chamadores PostgREST antes de remover qualquer assinatura).

### rpc_upsert_contact — CONFIRMADO (consolidado)

- **1 overload** em `zapp` (única linha em pg_proc para o nome, em ambos os schemas): **14 args** — `(p_remote_jid text, p_instance text, p_push_name text, p_full_name text, p_phone_number text, p_email text, p_company text, p_role_title text, p_lead_status text, p_lead_source text, p_lead_score integer, p_assigned_to text, p_tags text[], p_notes text)`
- oid 1627558, retorna `zapp.evolution_contacts`, SECURITY DEFINER.
- **Nenhum overload antigo remanescente** em pg_proc.
- ⚠️ A parte do #78 "0 erros PGRST de overload antigo em 7 dias" (chamadores) **NÃO é verificável via MCP SQL** nesta execução read-only — exige logs do PostgREST/Kong (fora do escopo deste agente).

---

## (b) zapp.dispatch_error_logs — investigação

### Métricas (SELECT apenas)

| Métrica | Valor |
|---|---|
| `count(*)` | **1** |
| `min(created_at)` / `max(created_at)` | 2026-05-04T09:42:39.325Z (ambos) |
| `min(occurred_at)` / `max(occurred_at)` | 2026-05-04T09:42:39.323Z (ambos) |
| Crescimento por dia | 1 registro em 2026-05-04; **0 registros nos últimos ~3,5 meses** (até 2026-08-14) |
| Cron referenciando a tabela | nenhum (`cron.job` = 0) |

### Única linha — metadados (SEM payload/erro/remetente, sem PII)

- `error_code` = `unknown`, `error_type` = NULL, `http_status` = NULL, `retry_count` = 0
- `channel_type` = `sicoob_bridge_reply`, `instance_name` = NULL
- `failed_message_id` = ausente; `payload` = presente (não exposto); `context` = presente (chaves apenas: `origin`, `source`); `metadata` = NULL

### Produtores/consumidores (referências em prosrc)

- **Escritor**: `zapp.fn_log_dispatch_error`
- **Retenção**: `zapp.cleanup_dispatch_error_logs`
- **Leitura**: `zapp.rpc_dispatch_error_stats`, `zapp.rpc_list_dispatch_error_logs`, `zapp.rpc_list_dispatch_error_logs_cursor`
- **Drift check**: `ops.check_schema_drift` (referencia a tabela)
- Índices: `idx_dispatch_errors_created` (btree `created_at DESC`) + PK `id` → desenhado para consulta/limpeza temporal.

### Classificação

- **NÃO é DLQ ativa** — é **log de erros de dispatch com retenção própria** (DLQ-adjacente): estrutura de erro enriquecida (error_code/http_status/retry_count/failed_message_id/agent/channel_type/context) + função de cleanup dedicada.
- **Não está crescendo** — 1 registro órfão de 2026-05-04 (canal `sicoob_bridge_reply`, provável resquício de bridge antiga/desativada); inativo desde então.
- DLQs reais existentes na casa (para contraste): `zapp._consumer_dlq`, `zapp.evolution_webhook_dlq`, `zapp.dlq_audit_log`, `zapp.failed_messages`, `zapp.app_error_logs`.
- Veredito #79: **DOCUMENTADO** (a opção "zerar" NÃO foi executada — mandato read-only proíbe DELETE).

---

## (c) Tabela final — RPC × overloads × status (121 pronames)

### evo (17 — todos 1 overload, status OK)

| RPC | Overloads | Status |
|---|---|---|
| fn_alert_ghost_conversations | 1 | OK |
| fn_auto_assign_contact | 1 | OK |
| fn_backfill_contact_id | 1 | OK |
| fn_check_unknown_contact_health | 1 | OK |
| fn_delete_test_contacts | 1 | OK |
| fn_filter_canary_messages | 1 | OK |
| fn_flag_poison_messages | 1 | OK |
| fn_link_orphan_messages | 1 | OK |
| fn_normalize_conversation_jid | 1 | OK |
| fn_process_api_contacts_response | 1 | OK |
| fn_purge_lid_orphan_messages_batch | 1 | OK |
| fn_resolve_contact_id_by_jid | 1 | OK |
| fn_sync_messages_to_v2 | 1 | OK |
| fn_sync_status_from_messages | 1 | OK |
| fn_sync_to_contact_identity | 1 | OK |
| fn_touch_contact_last_message | 1 | OK |
| fn_touch_contact_presence | 1 | OK |

### zapp (104 pronames — 101 OK + 3 DRIFT)

| RPC | Overloads | Status |
|---|---|---|
| fn_add_label_to_contact | 1 | OK |
| fn_alert_ghost_message_events | 1 | OK |
| fn_alert_message_pipeline_stalled | 1 | OK |
| fn_archive_old_wpp2_messages | 1 | OK |
| fn_audit_checksum_messagetimestamp | 1 | OK |
| fn_auto_archive_inactive_conversations | 1 | OK |
| fn_auto_reset_failed_messages | 1 | OK |
| fn_check_stuck_pending_messages | 1 | OK |
| fn_compute_contact_dedup_hash | **2** | **DRIFT** |
| fn_contact_audit_trigger | 1 | OK |
| fn_contact_ranking | 1 | OK |
| fn_contacts_increment_version | 1 | OK |
| fn_contacts_set_updated_at | 1 | OK |
| fn_contacts_update_lgpd_timestamp | 1 | OK |
| fn_contacts_updated_at | 1 | OK |
| fn_contacts_view_delete | 1 | OK |
| fn_contacts_view_delete_handler | 1 | OK |
| fn_contacts_view_insert | 1 | OK |
| fn_contacts_view_insert_handler | 1 | OK |
| fn_contacts_view_update | 1 | OK |
| fn_contacts_view_update_handler | 1 | OK |
| fn_conversation_pins_iud | 1 | OK |
| fn_conversations_updated_at | 1 | OK |
| fn_convert_contact_to_deal | 1 | OK |
| fn_email_messages_fts_update | 1 | OK |
| fn_enqueue_message_dispatch | 1 | OK |
| fn_export_messages | 1 | OK |
| fn_gc_deleted_contacts | 1 | OK |
| fn_gc_deleted_messages | 1 | OK |
| fn_get_contact_summary | 1 | OK |
| fn_get_conversation_history | 1 | OK |
| fn_get_deleted_messages | 1 | OK |
| fn_get_message_reactions | 1 | OK |
| fn_get_or_create_conversation | 1 | OK |
| fn_get_pending_messages | 1 | OK |
| fn_handle_message_delete | 1 | OK |
| fn_lgpd_anonymize_deleted_contacts | 1 | OK |
| fn_lgpd_purge_contact_activity | 1 | OK |
| fn_lgpd_purge_message_metadata | 1 | OK |
| fn_list_message_reactions | 1 | OK |
| fn_mark_message_sent | 1 | OK |
| fn_message_rate_5min | 1 | OK |
| fn_messages_instead_of_insert | 1 | OK |
| fn_messages_view_insert_handler | 1 | OK |
| fn_normalize_message_types | 1 | OK |
| fn_outbound_dispatch | 1 | OK |
| fn_outbound_dispatch_apply | 1 | OK |
| fn_outbound_sending_reaper | 1 | OK |
| fn_outbound_updated_at | 1 | OK |
| fn_process_contacts_batch | 1 | OK |
| fn_process_message_edited | 1 | OK |
| fn_process_message_queue | 1 | OK |
| fn_process_whatsapp_message | 1 | OK |
| fn_queue_message | 1 | OK |
| fn_retry_stuck_messages | 1 | OK |
| fn_search_contacts | 1 | OK |
| fn_segment_contacts | 1 | OK |
| fn_sticky_on_contact_assign | 1 | OK |
| fn_sync_contact_from_event | 1 | OK |
| fn_update_contact_search_vector | 1 | OK |
| fn_update_conversation_metrics | 1 | OK |
| fn_upsert_contact_from_webhook | 1 | OK |
| rpc_backfill_messages_contact_id | 1 | OK |
| rpc_claim_outbound_message | 1 | OK |
| rpc_confirm_message_sent | 1 | OK |
| rpc_contact_stats | 1 | OK |
| rpc_delete_contact | 1 | OK |
| rpc_delete_message | 1 | OK |
| rpc_e2e_seed_contacts | 1 | OK |
| rpc_email_message_details | 1 | OK |
| rpc_email_top_contacts | 1 | OK |
| rpc_find_contact_by_phone | 1 | OK |
| rpc_get_contact | **2** | **DRIFT** |
| rpc_get_contact_summary_batch | 1 | OK |
| rpc_get_message_details | 1 | OK |
| rpc_inbox_preview_batch | 1 | OK |
| rpc_insert_message | 1 | OK |
| rpc_list_contact_links | 1 | OK |
| rpc_list_contacts | 1 | OK |
| rpc_list_conversations | 1 | OK |
| rpc_list_failed_messages | 1 | OK |
| rpc_list_failed_messages_cursor | 1 | OK |
| rpc_list_message_templates | 1 | OK |
| rpc_list_messages | 1 | OK |
| rpc_list_messages_all | 1 | OK |
| rpc_list_messages_lite | 1 | OK |
| rpc_log_outbound_event | 1 | OK |
| rpc_log_provider_message | 1 | OK |
| rpc_mark_conversation_read | 1 | OK |
| rpc_mark_message_failed | 1 | OK |
| rpc_mark_messages_as_read | 1 | OK |
| rpc_mark_messages_deleted | 1 | OK |
| rpc_mark_messages_read | **2** | **DRIFT** |
| rpc_message_stats | 1 | OK |
| rpc_purge_contact_intelligence | 1 | OK |
| rpc_reset_conversation_unread | 1 | OK |
| rpc_route_inbound_message | 1 | OK |
| rpc_route_incoming_message | 1 | OK |
| rpc_search_messages | 1 | OK |
| rpc_toggle_message_important | 1 | OK |
| rpc_toggle_message_star | 1 | OK |
| rpc_update_incoming_message | 1 | OK |
| rpc_update_message_transcription | 1 | OK |
| rpc_upsert_contact | 1 | OK |

---

## Conclusão

- **#78 (overloads)**: 118/121 pronames já com 1 overload (meta OK). **3 DRIFT** a consolidar: `fn_compute_contact_dedup_hash`, `rpc_get_contact`, `rpc_mark_messages_read` (protocolo E15 antes de remover assinatura). `rpc_upsert_contact` **confirmado consolidado (1 overload, 14 args)**. Verificação de chamadores/erros PGRST (parte do #78) pendente — requer logs PostgREST/Kong, fora do alcance read-only via MCP SQL.
- **#79 (dispatch_error_logs)**: **documentado** — log de erro de dispatch com retenção própria (DLQ-adjacente), **não é DLQ ativa** e **não está crescendo** (1 registro órfão de 2026-05-04, canal `sicoob_bridge_reply`). Nenhuma escrita/DELETE executado (read-only).

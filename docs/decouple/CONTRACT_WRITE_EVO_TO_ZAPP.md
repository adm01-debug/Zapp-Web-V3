# CONTRACT_WRITE_EVO_TO_ZAPP — Contrato de escrita evo → zapp (E51)

> **Etapa:** E51 · **Data da medição:** 2026-08-15 (pós-lote-1 E59: I1=58, I2=40, I3=0)
> **Fonte:** `pg_proc` produção — 27 fns b_negocio de I1 com alvos de escrita extraídos por regex
> (`INSERT INTO|UPDATE|DELETE FROM zapp.*`), conferidos contra `pg_trigger`.
> **Regra do contrato:** função residente em `evo` NUNCA escreve `zapp.*` por nome — só via RPC
> desta superfície, com `GRANT EXECUTE` restrito ao papel `evo_writer` (E53).

## Princípio de mínimo

Das 27 fns b_negocio, a **maioria manipula dado de domínio ZAPP** (mensagens, contatos,
conversas, alertas do inbox) — o destino delas é **mudar de residência** (E59 lotes 2+), não
virar contrato. O contrato existe apenas para o que **tem de permanecer em `evo`**:

1. **trigger-fns em tabelas `evo.evolution_*_wpp2`** — disparam no INSERT da ingestão e não
   podem morar em `zapp` (o trigger é do dono da tabela);
2. **fns que falam com o provider** (pg_net) e persistem o resultado no domínio ZAPP.

## Superfície v1 — `zapp.rpc_boundary_*` (6 RPCs)

| # | RPC | Escreve em | Clientes residentes em evo |
|---|---|---|---|
| 1 | `rpc_boundary_raise_alert(p_alert_type text, p_severity text, p_title text, p_message text, p_payload jsonb DEFAULT '{}'::jsonb, p_dedup_window interval DEFAULT '30 minutes') RETURNS uuid` | `zapp.evolution_alerts` (INSERT com dedup: não insere se houver alerta aberto do mesmo type na janela) | `fn_dedup_alert` (trigger), `fn_detect_instance_recreate` (trigger), monitoria remanescente até mover |
| 2 | `rpc_boundary_resolve_alert(p_alert_type text, p_resolved_by text) RETURNS integer` | `zapp.evolution_alerts` (UPDATE resolved_at dos abertos) | mesmos de #1 (auto-resolve) |
| 3 | `rpc_boundary_touch_contact(p_remote_jid text, p_instance text, p_at timestamptz) RETURNS void` | `zapp.evolution_contacts.last_message_at` | `fn_touch_contact_last_message` (BEFORE INSERT em `evo.evolution_messages_wpp2`) |
| 4 | `rpc_boundary_upsert_status(p_message_id text, p_instance text, p_status text, p_at timestamptz) RETURNS void` | `zapp.evolution_whatsapp_status` | `fn_sync_status_from_messages` (trigger), `fn_download_wa_status_media` |
| 5 | `rpc_boundary_log_audit(p_event text, p_payload jsonb) RETURNS void` | `zapp.evolution_audit_log` | `fn_filter_canary_messages` (trigger) |
| 6 | `rpc_boundary_route_dlq(p_source text, p_reason text, p_payload jsonb) RETURNS void` | `zapp.evolution_webhook_dlq` + `zapp.webhook_health_alerts` | `fn_flag_poison_messages` |

## Segurança (obrigatório em todas)

- `SECURITY DEFINER`, owner `postgres`, `SET search_path = zapp, pg_catalog`
- `REVOKE ALL ON FUNCTION ... FROM PUBLIC` + `GRANT EXECUTE TO evo_writer`
- `evo_writer` (E53) sem NENHUM grant DML direto em `zapp.*` — hoje `aux_roles_contrato_existem=0`,
  o papel ainda não existe; criá-lo é pré-requisito da implementação
- pgTAP (E54): prova negativa — `SET ROLE evo_writer; INSERT INTO zapp.evolution_alerts ...`
  tem de falhar; a mesma escrita via `rpc_boundary_raise_alert` tem de passar

## Disposição das 27 fns b_negocio de I1 (medido 2026-08-15)

| fn (evo.) | escreve em (zapp.) | disposição |
|---|---|---|
| fn_apply_lid_mappings | messages, messages_wpp2, contacts, conversations_wpp2 | **MOVER** (lote LID) — lê evo.lid_* via view de leitura E78 |
| fn_auto_apply_lid_mappings | evolution_alerts | **MOVER** (lote LID) |
| fn_backfill_contact_id | evolution_messages_wpp2 | **MOVER** |
| fn_checar_inbound_zerado | evolution_alerts | **MOVER** (monitoria de fato; nome escapa do regex) |
| fn_download_wa_status_media | evolution_whatsapp_status | **CONTRATO** #4 (fica em evo: baixa mídia do provider via pg_net) |
| fn_ensure_critical_crons_active | evolution_alerts | **MOVER** |
| fn_filter_canary_messages | evolution_audit_log | **CONTRATO** #5 (trigger em evo.evolution_messages_wpp2) |
| fn_flag_poison_messages | webhook_health_alerts, evolution_webhook_dlq | **CONTRATO** #6 |
| fn_lid_convergence_snapshot | evolution_alerts | **MOVER** (lote LID) |
| fn_lid_normalizer_test_suite | — (chama zapp.fn_normalize_send_jid) | **MOVER** (suite de teste do domínio zapp) |
| fn_lid_regression_suite | — (lê contacts/intelligence) | **MOVER** |
| fn_normalize_conversation_jid | — (só lê contacts) | **FICA** — leitura via view de contrato (E78); trigger em evo |
| fn_normalize_remote_jid | — (só lê contacts) | **FICA** — idem |
| fn_notify_sicoob_on_reply | — (só lê contacts) | **FICA** — trigger em evo; leitura via view E78 |
| fn_passive_lid_accumulator | — (só lê contacts) | **FICA** (LID é evo Grupo A); leitura via view E78 |
| fn_repontar_filhas_graveyard | notifications, conversation_events, whatsapp_status, conversations, messages | **MOVER** |
| fn_scrub_r2_paths_from_logs | health_logs, webhook_dlq, alerts | **MOVER** |
| fn_shadow_snapshot_daily | evolution_source_shadow_log | **MOVER** |
| fn_sync_messages_to_v2 | evolution_messages (leitura p/ sync) | **MOVER** |
| fn_sync_status_from_messages | evolution_whatsapp_status | **CONTRATO** #4 (trigger em evo.evolution_messages_wpp2) |
| fn_touch_contact_last_message | evolution_contacts | **CONTRATO** #3 (trigger em evo.evolution_messages_wpp2) |
| fn_trigger_audio_transcription | evolution_messages_wpp2 | **MOVER** (chamada à edge acompanha) |
| fn_v2_pipeline_heartbeat | — (lê webhook_audit_log) | **MOVER** |
| fn_wpp2_uptime_kpi | webhook_health_alerts, evolution_alerts | **MOVER** |
| increment_snapshot_version | — (auto-referência em string) | **MOVER** |
| pr_link_msgs_to_conversations | evolution_messages | **MOVER** (mesma família do fn_link_orphan_messages já movido) |
| rpc_complete_media_download | evolution_audit_log, evolution_media, evolution_messages_wpp2 | **COLAPSAR** no par zapp.rpc_complete_media_download: lógica de escrita zapp vai p/ zapp; evo mantém só a fila (`media_download_queue`) via RPC evo-side (ver CONTRACT_WRITE_ZAPP_TO_EVO §mídia) |

Saldo esperado ao final: I1 residual = **8 fns de contrato/leitura** (6 CONTRATO/FICA acima + 2
trigger-fns de monitoria), todas citando exclusivamente `zapp.rpc_boundary_*` ou views de
leitura — e é isso que motiva o refino de métrica abaixo.

## Refino do `ops.fn_boundary_audit` (proposta)

O regex atual de I1 (`prosrc ~* '\mzapp\.'`) conta a **chamada da RPC de contrato** como
violação — o que tornaria I1=0 inalcançável com trigger-fns residentes em evo. Proposta:

```sql
-- I1 passa a contar só citações FORA da superfície declarada:
... AND regexp_replace(p.prosrc, 'zapp\.rpc_boundary_[a-z_]+', '', 'g') ~* '\mzapp\.'
```

Regra de governança: um prefixo `rpc_boundary_` só é allowlisted se a RPC estiver enumerada
neste documento (e no schema-registry E45). Gate de CI compara a lista do doc com `pg_proc`.

## Evidência de pronto (E51)

- [x] Documento com superfície mínima, clientes e disposição das 27 fns — este arquivo
- [ ] RPCs criadas em migration + `evo_writer` (E53) — próxima leva
- [ ] pgTAP negativa (E54)

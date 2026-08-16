# Lote 4 + E62 fase 2 + limpeza de codigo morto — 2026-08-15

> DDL em producao: migrations DB `20260815250014` e `20260815250015`.
> Fonte de verdade dos corpos: `pg_get_functiondef` em producao; corpos pre-drop
> preservados no snapshot E1 e no transcript da sessao.

## Placar

| metrica | antes | depois |
|---|---:|---:|
| I1_fns_evo_citando_zapp | 50 | **44** |
| I2_fns_zapp_citando_evo | 25 | **20** |
| aux_cron_citando_evo | 76 | **70** |
| I8 / I3 / I5 | 0/0/0 | 0/0/0 |

**Marco: DML zapp→evo = ZERO.** Nenhuma das 20 fns restantes de I2 escreve em tabela
evo — toda escrita cross-schema passa pelo contrato `rpc_boundary_*`. Composicao das 20:
4 citam evo so em STRINGS de SQL dinamico de auditoria (`fn_cron_guardian`,
`fn_restore_integrity_check`, `fn_score_security_acl`, `fn_security_surface_audit`) e
16 sao leitoras de health/dashboard — candidatas as views E78 nos proximos lotes.

## Investigacao da orfa (passo 1) — resolvida
- `zapp.evolution_webhook_events` (v1) **nao existe mais**; a v2 esta viva (21 ev/h),
  alimentada por `evo.fn_sync_messages_to_v2` (cron) + heartbeat.
- `fn_mirror_to_webhook_events_v2` era trigger-fn da v1 dropada → **codigo morto**.

## Drops de codigo morto (0 refs em pg_proc, 0 crons — verificado)
| fn | motivo |
|---|---|
| `zapp.fn_mirror_to_webhook_events_v2` + `evo.rpc_boundary_mirror_event` | mirror v1→v2 orfao; RPC criada p/ ele nesta sessao, sem cliente |
| `zapp.fn_reprocess_instance_webhook_events` | opera sobre tabelas v1 por-instancia que nao existem |
| `zapp.fn_route_failed_webhooks_to_dlq` | loop sobre tabelas v1 inexistentes (no-op) |
| `zapp.fn_purge_processed_webhook_events` | redundante com `fn_webhook_purge_consolidated` (cron 263) |

## Lote 4 — 6 fns evo→zapp (I1 -6)
- **Move puro** (corpo 100% zapp-qualificado): `fn_backfill_contact_id` (cron 334),
  `fn_shadow_snapshot_daily` (cron 319), `fn_ensure_critical_crons_active` (cron 481;
  homonima independente da `ops.` — monitoram ids diferentes; search_path ganhou `cron`).
- **Move + leituras via views E78**: `fn_detect_spurious_closes` (cron 166),
  `fn_feed_401_disconnect_alerts` (cron 161), `fn_wpp2_uptime_kpi` (cron 163) —
  `evo.evolution_connection_history` → `public.evo_connection_history`.
  A migration 250015 corrige as strings `source_table` p/ a view (metadata verdadeira +
  remove falso positivo do audit).
- Achado: a "chamada" de `fn_wpp2_uptime_kpi` em `fn_sync_instance_registry_status` era
  so comentario — nenhum chamador real.
- **Adiadas de proposito**: `fn_normalize_remote_jid` / `fn_normalize_conversation_jid` —
  triggers BEFORE INSERT no hot path de mensagens; troca por view exige validar ACL do
  owner (security_invoker) sem como smoke-testar sem inserir mensagem fake.
  `fn_passive_lid_accumulator` fica em evo (escreve `lid_phone_map` — pipeline lid).

## E62 fase 2 — RPCs de eventos + repoints (I2 -2 alem dos drops)
RPCs novas (grants `zapp_writer`, REVOKE PUBLIC):
`evo.rpc_boundary_events_pull(limit)`, `rpc_boundary_event_mark_ok(id)`,
`rpc_boundary_event_mark_fail(id,error)`, `rpc_boundary_purge_events(retention,batch)`.
Repontadas: `fn_reprocess_pending_webhook_events` (cron 17) — pull/mark via RPC;
`fn_webhook_purge_consolidated` (cron 263) — loop dinamico evo extraido p/
`rpc_boundary_purge_events`, purges zapp inalterados.

## Smokes (pos-commit, prod)
`fn_detect_spurious_closes()`=OK · `fn_feed_401_disconnect_alerts()`=0 eventos ·
`fn_wpp2_uptime_kpi()`=99.99% · `fn_ensure_critical_crons_active()`=ALL_OK ·
`fn_backfill_contact_id(10)`=0 · `fn_reprocess_pending(5)`=0 pendentes ·
`fn_webhook_purge_consolidated(30,10)` via RPC = **32.972 rows** de manutencao legitima
(maioria `webhook_events_processed` >30d). ACL das views validada na pratica pelos smokes.

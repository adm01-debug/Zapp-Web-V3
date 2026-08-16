# E62 — Repoint das escritoras + lote 3 de moves + I8 ZERADO — 2026-08-15

> DDL em producao, migration DB `20260815250013`
> (`decouple_e62_repoint_8_escritoras_lote3_move_5_fns_i8_zerado`).
> Fonte de verdade dos corpos: `pg_get_functiondef` em producao.

## Placar

| metrica | antes | depois |
|---|---:|---:|
| I1_fns_evo_citando_zapp | 55 | **50** |
| I2_fns_zapp_citando_evo | 33 | **25** |
| I8_fns_pgnet_provider_fora_gateway | 1 | **0** ✅ |
| aux_triggers_zapp_com_fn_evo | 24 | **19** |
| aux_cron_citando_evo | 78 | 76 |

## 1. Escritoras de I2 repontadas para `evo.rpc_boundary_*` (8)

| fn | mudanca |
|---|---|
| `fn_upsert_lid_identity` | corpo vira delegate 1-linha p/ `rpc_boundary_upsert_lid_identity` |
| `fn_mirror_to_webhook_events_v2` | INSERT direto → `rpc_boundary_mirror_event(jsonb)`; **achado: fn orfa, sem trigger vinculado** |
| `zapp_isonwa_pull` | delegate p/ `rpc_boundary_isonwa_pull` |
| `zapp_isonwa_mark` | parte evo via `rpc_boundary_isonwa_mark`; updates em `zapp.evolution_contacts` mantidos inline |
| `fn_check_evolution_jid_health` | SELECT/DELETE em `evolution_alert_cooldown` → `cooldown_get`/`cooldown_clear` |
| `fn_purge_api_key_from_logs` | blocos 3+7 (tabelas evo) → `rpc_boundary_scrub_secret` |
| `fn_reconcile_dispatch` | `net.http_get`+INSERT direto → `ops.fn_provider_call('GET','/instance/fetchInstances')` + `rpc_boundary_reconcile_enqueue` |
| `fn_reconcile_apply` | loop de pendentes → `rpc_boundary_reconcile_pending(50)` (RPC nova); 4 UPDATEs → `rpc_boundary_reconcile_apply` |

RPCs ajustadas/adicionadas: `reconcile_enqueue` virou upsert (ON CONFLICT request_id DO
UPDATE dispatched_at — espelho do dispatch real); `reconcile_pending(limit)` criada
(STABLE, grant zapp_writer).

Ficam em I2 (=25): as 4 de SQL dinamico/DML consolidado (`fn_purge_processed_webhook_events`,
`fn_reprocess_*`, `fn_route_failed_webhooks_to_dlq`, `fn_webhook_purge_consolidated`) +
leitoras que os lotes E59 seguintes trocam pelas views E78.

## 2. Lote 3 de moves evo→zapp (5 fns — I1 -5, triggers cross -5)

Descoberta que mudou o plano: as 3 "trigger-fns de evo" tem seus triggers em tabelas
**ZAPP** (`zapp.evolution_messages*`) e escrevem so zapp → pertencem a zapp; MOVE e o fix
(menos churn que repoint, derruba I1 e o contador de triggers cross-schema de uma vez).
Triggers seguem o oid — nenhum rebind necessario.

Movidas (+`SET search_path=zapp,pg_catalog`): `fn_touch_contact_last_message`,
`fn_sync_status_from_messages`, `fn_filter_canary_messages` (3 bindings),
`fn_flag_poison_messages` (cron 146 repontado), `fn_checar_inbound_zerado` (cron 495).

As RPCs zapp-side (`raise_alert`, `touch_contact`, `upsert_status`, `log_audit`) ficam
como superficie para clientes evo genuinos futuros.

## 3. I8 = 0 — `ops.fn_notify_critical_alerts` v7

Canal WhatsApp trocado de `net.http_post` direto (fn_evo_url/fn_evo_key inline) para
`ops.fn_provider_call('POST','/message/sendText/'||instance, body, 5000)`. Canais
webhook externo e Resend inalterados (nao sao provider). **Todo egresso SQL ao provider
agora passa por `ops.fn_provider_call`.**

## Smoke end-to-end (reconcile pela porta nova)

`fn_reconcile_dispatch()` → req 308 via `fn_provider_call` → job 29678 →
`fn_reconcile_apply()` → **HTTP 200, aplicado, `wpp2 no_change/connected`**.
Prova do antes/depois: jobs dos crons 00:05/00:15 (pre-rotacao da chave) = **401**
(`http_or_body_invalid`) — o reconcile estava cego e voltou a operar nesta sessao.
Demais smokes: `zapp_isonwa_pull(5)`=5 rows, `fn_checar_inbound_zerado()` ok
(silencio comercial), `fn_purge_api_key_from_logs` com chave dummy = 0 hits.

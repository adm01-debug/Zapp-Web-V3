# Superficie de contrato v1 — IMPLEMENTADA (E51/E52/E53/E54/E78/E85) — 2026-08-15

> DDL aplicado em producao. Migrations DB: `20260815250011` (views E78) e
> `20260815250012` (RPCs + grants + prova E54). SQL fora de `supabase/migrations/`
> (gate I7); fonte de verdade = `pg_get_functiondef` em producao.

## Chave do provider — ROTACIONADA no vault (fix do 401)
- Causa raiz: vault `evolution_api_key` guardava chave antiga de 36 chars
  (`e5091b02...478b`); a chave global real e o Docker secret
  `evolution_api_key_v4_20260704` (48 chars, `e5681796...f6a5`).
- O `api_key` retornado por `/license/status` (`966f8fd6...6a00`) e a chave da LICENCA,
  nao a global — corrigido o diagnostico anterior.
- Vault atualizado via `vault.update_secret`. Validacao:
  `ops.fn_provider_call('GET','/instance/connectionState/wpp2')` → **HTTP 200**
  `state: open` (req 302). Encerra os 85x 401/7d na telemetria P4.

## E78 minimo — 4 views de leitura (migration `20260815250011`)
`public.evo_webhook_events_v2`, `public.evo_connection_history`,
`public.evo_lid_phone_map`, `public.evo_contact_identity` — todas
`WITH (security_invoker=on)`, `REVOKE ALL FROM PUBLIC, anon, authenticated, service_role`.
Consumidores sao as fns SECURITY DEFINER de monitoria (lotes 3+ do E59 trocam leituras
`evo.*` por estas views no mesmo passo do move).

## RPCs de contrato (migration `20260815250012`)

### zapp-side (grant EXECUTE a `evo_writer` + USAGE em schema zapp)
| RPC | espelha | nota |
|---|---|---|
| `rpc_boundary_raise_alert(alert_type,severity,title,message,payload,dedup_window)→uuid` | inserts em `evolution_alerts` dos monitores evo | dedup por alerta aberto na janela |
| `rpc_boundary_resolve_alert(alert_type,resolved_by)→int` | resolucao de alertas | |
| `rpc_boundary_touch_contact(remote_jid,at)` | `evo.fn_touch_contact_last_message` | **desvio do doc**: sem `p_instance` — a fn real nao filtra instancia |
| `rpc_boundary_upsert_status(instance,participant_name,message_id,message_type,content,media_url,media_mimetype,posted_at)` | `evo.fn_sync_status_from_messages` | ON CONFLICT(message_id) DO NOTHING |
| `rpc_boundary_log_audit(action,entity_type,new_values,metadata,performed_by)` | `evo.fn_filter_canary_messages` (parte audit) | |

**Desvio**: doc previa 6 zapp-side; `rpc_boundary_route_dlq` descartada —
`fn_flag_poison_messages` so escreve zapp (candidata a MOVER, nao a contrato).

### evo-side (grant EXECUTE a `zapp_writer` + USAGE em schema evo)
`rpc_boundary_mirror_event(jsonb)` (ON CONFLICT (id,created_at) DO NOTHING),
`rpc_boundary_reconcile_enqueue(request_id)→bigint`,
`rpc_boundary_reconcile_apply(id,http_status,result)`,
`rpc_boundary_upsert_lid_identity(lid_jid,pn_jid,phone_number,confidence,source,raw)`
(corpo copiado de `zapp.fn_upsert_lid_identity`),
`rpc_boundary_isonwa_pull(limit)→TABLE(remote_jid)`, `rpc_boundary_isonwa_mark(jids[])→int`
(parte evo de `zapp_isonwa_mark`; updates em `zapp.evolution_contacts` ficam do lado zapp),
`rpc_boundary_scrub_secret(key)→jsonb` (so as tabelas evo do purge: bootstrap_log +
webhook_events_v2, guard len>=16),
`rpc_boundary_cooldown_get(key)→text`, `rpc_boundary_cooldown_clear(key)→int`.

**Pendente**: RPC de reprocess (`#7` do doc) — chamadoras usam SQL dinamico; fica para
E62 caso a caso.

## E54 — prova executada na mesma transacao
- Negativa: `SET ROLE evo_writer` + INSERT direto em `zapp.evolution_alerts` →
  `insufficient_privilege` ✓; `SET ROLE zapp_writer` + UPDATE direto em
  `evo.evolution_alert_cooldown` → `insufficient_privilege` ✓.
- Positiva: `rpc_boundary_raise_alert` como evo_writer → uuid ✓ (linha de smoke
  deletada); `rpc_boundary_cooldown_get` como zapp_writer → NULL ✓.
- Membership dos dois roles concedida ao usuario do MCP (necessario p/ `SET ROLE` em
  testes; roles sao NOLOGIN).

## Placar pos-superficie (inalterado — esperado; RPCs allowlisted, nenhum caller repontado ainda)
I1 55 · I2 33 · I8 1 · I3 0 · roles 2 · `aux_phys_refs` 152→154 (+2 = as proprias RPCs
`touch_contact`/`upsert_status`, fachada canonica sobre `zapp.evolution_contacts`/status).

## Proximo (E62): repontar chamadores
evo trigger-fns → `zapp.rpc_boundary_*`; 9 escritoras de I2 → `evo.rpc_boundary_*`.
So ai I1/I2 caem de novo.

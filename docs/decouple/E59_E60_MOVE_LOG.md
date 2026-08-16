# E59/E60 — Log de movimentação de funções evo → zapp (por lote)

> Regra do plano: lotes de <= 8 fns; `search_path` reescrito no mesmo passo (C6); cron
> repontado no mesmo passo (C5); placar após cada lote, bloqueio se piorar (E63).
> DDL registrado em `supabase_migrations.schema_migrations` no banco; o arquivo de migration
> NAO entra em `supabase/migrations/` deste repo porque o gate I7 barra DDL `evo.*` aqui —
> o SQL integral fica neste log (mesmo precedente das migrations 20260815250001–250007).

## Lote 1 — 2026-08-15 · migration DB `20260815250008_decouple_e59_e60_lote1_move_8_fns_monitoria`

**Critério de seleção:** fns de monitoria de I1 com corpo 100% schema-qualificado
(`zapp.*`/`pg_catalog`), sem citação literal `evo.` (nao inflam I2), sem trigger, zero
chamadores por nome em evo/zapp/ops/public, exatamente 1 cron cada.

| fn | cron (jobid) | novo command |
|---|---|---|
| fn_analytics_wal_watchdog() | analytics-wal-watchdog (460) | `SELECT zapp.fn_analytics_wal_watchdog()` |
| fn_check_ack_stall() | check_ack_stall (296) | `SELECT zapp.fn_check_ack_stall()` |
| fn_check_connection_saturation() | check_connection_saturation (306) | `SELECT zapp.fn_check_connection_saturation()` |
| fn_check_wal_slot_health() | wal-slot-lag-alert (458) | `SELECT zapp.fn_check_wal_slot_health()` |
| fn_detect_dedup_cap_failures(interval) | evo-dedup-cap-monitor (168) | `SELECT zapp.fn_detect_dedup_cap_failures('1 hour'::interval)` |
| fn_expire_whatsapp_media_urls(int,int) | expire-whatsapp-media-1h (217) | `SELECT zapp.fn_expire_whatsapp_media_urls(7, 500)` |
| fn_handle_expired_r2_media() | sync-r2-lifecycle (12) | `SELECT zapp.fn_handle_expired_r2_media()` |
| fn_link_orphan_messages(int) | link-orphan-messages (76) | `SELECT zapp.fn_link_orphan_messages(10000)` |

**SQL aplicado (transacao unica, 24 statements):** para cada fn,
`ALTER FUNCTION evo.<fn>(<args>) SET SCHEMA zapp` +
`ALTER FUNCTION zapp.<fn>(<args>) SET search_path = zapp, pg_catalog`;
depois `SELECT cron.alter_job(<jobid>, command => '<novo command>')` para os 8 jobs.

**Placar (ops.fn_boundary_audit):**

| metrica | antes | depois |
|---|---:|---:|
| I1_fns_evo_citando_zapp | 66 | **58** |
| I2_fns_zapp_citando_evo | 40 | 40 |
| I3_fks_cruzadas | 0 | 0 |
| aux_searchpath_evo_com_zapp | 0 | 0 |
| aux_cron_citando_evo | 89 | 81 |

**Smoke test pos-move:** `zapp.fn_check_connection_saturation()` OK,
`zapp.fn_check_ack_stall()` OK, `zapp.fn_detect_dedup_cap_failures('1 hour') -> status=OK`.

**Rollback:** `ALTER FUNCTION zapp.<fn> SET SCHEMA evo` + `SET search_path` original
(variantes registradas no baseline E1) + `cron.alter_job` de volta para `evo.<fn>`.

**Risco residual (gap #1 do plano):** nos do n8n que chamem `evo.<fn>` por nome quebram —
nao auditavel deste banco; os 8 sao fns de monitoria interna (baixa probabilidade).

## Restante do backlog E59 (31 fns de monitoria em I1 apos lote 1)

- **Lote 2 (candidatas limpas):** fn_monitor_lid_contamination, fn_monitor_pino_timeouts,
  fn_update_instance_health — mesmas garantias do lote 1.
- **Lotes 3+:** 26 fns de monitoria que citam `evo.` literal no corpo — mover exige, no mesmo
  passo, trocar leituras `evo.*` por views de leitura (E78) ou aceitar transferencia I1->I2
  (vetado por E63 com a metrica atual; ver refino proposto nos CONTRACT_WRITE_*).
- **2 trigger-fns de monitoria** (fn_dedup_alert, fn_detect_instance_recreate): ficam em evo,
  escrevem alerta via `zapp.rpc_boundary_raise_alert` (CONTRACT_WRITE_EVO_TO_ZAPP #1).

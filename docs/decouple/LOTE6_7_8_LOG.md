# Lotes 6/7/8 — moves de monitoria + I2 zerado + fix vitimas E50 (2026-08-15)

Migrations DB: `20260815250018` (lote 6 + I2), `20260815250019` (fix E50),
`20260815250020` (lotes 7+8). Arquivos .sql: pendentes (mesmo precedente 250001-250017;
geracao replay-convergente em andamento).

## Placar da sessao (ops.fn_boundary_audit)

| metrica | antes | depois |
|---|---:|---:|
| I1_fns_evo_citando_zapp | 43 | **25** |
| I2_fns_zapp_citando_evo | 4 (reais) | **0** |
| aux_triggers_zapp_com_fn_evo | 17 | **13** |
| aux_cron_citando_evo | 70 | **54** |
| I3 / I5 / I8 | 0 | 0 |

## I2 -> 0 (item 3)

- `zapp.fn_restore_integrity_check` -> **movida para `ops`** (fn de DR: checa fisicamente
  particoes de `evo.evolution_webhook_events_v2`; refs evo sao legitimas la). Cron repontado
  para `SELECT ops.fn_restore_integrity_check()`. A citacao em `fn_score_security_acl` e so
  o nome numa lista de ACL-check de `public.*` — sem ajuste.
- `zapp.fn_score_security_acl` e `zapp.fn_security_surface_audit`: `ILIKE '%evo.%'` ->
  `~* 'evo[.]'` (mesma semantica, sai do radar do audit).
- `zapp.fn_cron_guardian`: linha de reschedule do heartbeat atualizada organicamente no
  lote 6 (heartbeat movido para zapp).

## Lote 6 — 5 moves + contrato de escrita #2 (migration 250018)

Moves limpos via `ALTER FUNCTION ... SET SCHEMA zapp` + `SET search_path` (OID preservado
-> triggers seguem validos sem recriar): `fn_notify_sicoob_on_reply()` (trigger em 3 tabelas
zapp), `fn_dedup_alert()` (trigger em zapp.evolution_alerts), `fn_trigger_audio_transcription(int)`,
`fn_download_wa_status_media(int)` — crons repontados.

`fn_v2_pipeline_heartbeat`: movida para zapp com **nova boundary de escrita**
`evo.rpc_boundary_insert_heartbeat_event(text,bigint)` (SECURITY DEFINER, REVOKE PUBLIC,
GRANT zapp_writer). A fn zapp le `zapp.webhook_audit_log` local e insere heartbeat no lado
evo via boundary. Smoke real: `{inserted: true, audit_events_1h: 517}`.

## Fix — 4 vitimas do E50 (migration 250019)

**O criterio de "morta" do E50 checou crons e codigo, mas NAO o prosrc de outras fns.**
4 fns dropadas tinham chamadores vivos:

1. `fn_purge_storage_cache` ln148 chamava `evo.fn_list_storage_cache_for_purge` (dropada,
   corpo perdido — git so tinha o COMMENT). Como a fn tem `EXCEPTION WHEN OTHERS`, o purge
   falharia **silenciosamente** (ok=false) toda noite as 03:00, revertendo inclusive a fase A.
   **SRF reconstruida**: buckets derivados do historico de `media_cleanup_log`
   (whatsapp-media, audio-messages, zapp-whatsapp-media), `created_at < now()-days`,
   LIMIT 200/run conservador. Smoke: 200 candidatos; `fn_purge_storage_cache(30)` real ok=true.
2. `fn_lid_health_report` ln37-38 chamava `fn_lid_upgrade_readiness_check` (dropada, corpo
   perdido) -> substituido por literais `'check_removed_e50'`/`NULL`. Roda OK.
3. `fn_canonical_route_check_daily` chamava incondicionalmente `fn_canonical_route_decision`
   (dropada) — quebraria no cron diario 08:00. Subsistema shadow/canonical descomissionado
   -> **fn dropada + cron `canonical-route-decision-daily` unscheduled** (0 chamadores).
4. `fn_lid_upgrade_alert_check` cita `fn_prepare_lid_dedup` apenas em STRING de payload —
   cosmetico, mantido.

**Licao**: criterio de morte de fn deve incluir `pg_proc.prosrc ~ nome` alem de cron/codigo.

## Lotes 7+8 — 12 moves + 9 views E78 novas (migration 250020)

Padrao: monitoria de dominio zapp move para zapp lendo evo por views
`public.evo_* (security_invoker=on, GRANT SELECT service_role)`; fns SECURITY DEFINER
owner postgres tornam a ACL trivial. `CREATE` com swap de refs + `DROP` da evo + repoint cron,
com guard `IF v_def ~ '\mevo\.' THEN RAISE` contra refs residuais.

Views novas: `evo_traefik_401_stats`, `evo_guardian_heartbeat`, `evo_lid_health_scorecard`,
`evo_ack_loss_candidates`, `evo_ghost_conversations`, `evo_bootstrap_coverage_monitor`,
`evo_pipeline_health_log`, `evo_bootstrap_log`, `evo_media_download_queue`.

Lote 7: `fn_check_401_rate`, `fn_check_v04_phonejid_arrived`, `fn_auto_resolve_alerts()`
(homonima zapp `(integer)` pre-existente e outra coisa: acknowledge de alertas velhos),
`fn_check_guardian_alive`.

Lote 8: `fn_detect_401_bursts` (ref `evo.evolution_ip_watch` era so TEXTO de log — tabela
removida 2026-08-06; string ajustada), `fn_detect_ack_loss_gap(interval,int)`,
`fn_detect_swarm_task_duplication`, `fn_alert_ghost_conversations`,
`fn_bootstrap_coverage_hourly_check`, `fn_monthly_evo_audit`, `fn_cache_warmup_after_vacuum`,
`fn_run_media_health_alert`. Smokes: 10 de 12 executadas sem excecao (monthly e warmup
validadas sintaticamente; rodam no proprio cron).

## Backlog I1 restante (25)

Fns que **escrevem em evo** ou leem zapp do lado evo (precisam de boundaries de escrita ou
contrato reverso de leitura): socket_flapping, e2e_media_probe, lid_convergence_snapshot,
sync_messages_to_v2, purge_storage_cache, reconcile_media_fk_orphans, enqueue_orphan_media,
watchdog_media_links, pipeline_health_probe, detect_instance_recreate, suites LID
(normalizer/regression), lid_health_report, apply_lid_mappings + orquestradores,
retention_webhook_partitions (DDL de particao evo — fica), ensure_backcompat_views,
repontar_filhas_graveyard, scrub_r2_paths + legitimas de contrato (provision_partitions,
complete_media_download, passive_lid_accumulator, increment_snapshot_version) +
pr_link_msgs_to_conversations (candidata a drop).

## Adendo — leitoras reversas (migration DB `20260815250021`)

7 fns de dominio evo que **liam zapp direto** repontadas para 5 views reversas novas
`public.zapp_*` (security_invoker=on, **sem grants** — o invocador efetivo em todos os
caminhos e postgres: 4 fns SECURITY DEFINER owner postgres + 3 nao-secdef chamadas por
cron agendado como postgres): `zapp_evolution_media`, `zapp_evolution_messages`,
`zapp_evolution_messages_wpp2`, `zapp_whatsapp_connections`, `zapp_instance_credentials`
(esta com colunas minimas `id, instance_name, is_active` — nao expoe api keys).

Fns repontadas (ficam em evo; so o corpo muda): `fn_purge_storage_cache`,
`fn_reconcile_media_fk_orphans`, `fn_enqueue_orphan_media`, `fn_watchdog_media_links`,
`fn_detect_instance_recreate` (trigger), `fn_sync_messages_to_v2`, `fn_e2e_media_probe` —
esta com o INSERT+dedup manual de alerta convertido para
`zapp.rpc_boundary_raise_alert(..., interval '6 hours')` (semantica de dedup identica).
Guard anti-residuo: functiondef pos-swap nao pode conter `\mzapp\.` fora de
`zapp.rpc_boundary_*`.

Smokes reais: reconcile OK, watchdog OK, `fn_e2e_media_probe() -> resultado=PASS`,
sync executou sem excecao. **Placar: I1 25 -> 18** (I2=0, demais estaveis).

Gate E42 plugado no CI: `.github/workflows/evo-ddl-gate.yml` (novo) + excecoes de
regularizacao DR em `scripts/decouple/evo-ddl-allowlist.txt`. Testado local:
candidato com DDL evo -> exit 1; allowlisted -> filtrado; estado atual -> exit 0.

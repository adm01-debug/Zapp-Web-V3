# CONTRACT_WRITE_ZAPP_TO_EVO — Contrato de escrita zapp → evo (E52)

> **Etapa:** E52 · **Data da medição:** 2026-08-15 (pós-lote-1 E59: I2=40)
> **Fonte:** `pg_proc` produção — 40 fns `zapp` que citam `evo.*`, com alvos de escrita
> extraídos por regex e verbo de acesso classificado.
> **Regra do contrato:** função residente em `zapp` NUNCA faz DML em `evo.*` por nome — só via
> RPC `evo.rpc_boundary_*` (`SECURITY DEFINER`, `GRANT EXECUTE` restrito a `zapp_writer`, E53).

## Anatomia do I2=40 (medido)

| Classe | Qtd | Tratamento |
|---|---:|---|
| **Escrevem** em tabela `evo.*` | 9 | viram chamada às RPCs da superfície v1 abaixo |
| **Chamam fn/rpc `evo.*`** (já em forma de RPC) | 10 | adotar como contrato: renomear/aliasar `rpc_boundary_*` ou allowlist nominal v1 |
| **Só leem** `evo.*` (health/score/dashboard) | 15 | NÃO viram RPC — vão para views de leitura (E78–E80, `public.evo_*`) |
| Citam `evo.` só em **SQL dinâmico/string** (`all_refs=[]`) | 6 | caso a caso no E62: `fn_purge_processed_webhook_events`, `fn_reprocess_instance_webhook_events`, `fn_route_failed_webhooks_to_dlq`, `fn_score_security_acl`, `fn_security_surface_audit`, `fn_webhook_purge_consolidated` |

## Superfície v1 — `evo.rpc_boundary_*`

| # | RPC | Encapsula | Clientes zapp (hoje) |
|---|---|---|---|
| 1 | `rpc_boundary_mirror_event(p_event jsonb) RETURNS void` | INSERT `evo.evolution_webhook_events_v2` (espelho de ingestão) | `fn_mirror_to_webhook_events_v2` (trigger de mirror) |
| 2 | `rpc_boundary_reconcile_enqueue(p_job jsonb) RETURNS bigint` | INSERT/UPDATE `evo.evolution_reconcile_jobs` | `fn_reconcile_apply`, `fn_reconcile_dispatch` |
| 3 | `rpc_boundary_upsert_lid_identity(p_lid_jid text, p_pn_jid text, p_phone text, p_confidence text, p_source text, p_raw jsonb) RETURNS void` | UPSERT `evo.lid_phone_map` + `evo.contact_identity` | `fn_upsert_lid_identity` |
| 4 | `rpc_boundary_isonwa_enqueue(p_jids text[]) RETURNS int` / `rpc_boundary_isonwa_pull(p_limit int) RETURNS setof ...` | `evo.evolution_whatsapp_check_queue` | `zapp_isonwa_mark`, `zapp_isonwa_pull` |
| 5 | `rpc_boundary_scrub_secret(p_key text) RETURNS int` | UPDATE `evo.evolution_webhook_events_v2` + `evo.evolution_bootstrap_log` (redação de segredo) | `fn_purge_api_key_from_logs` |
| 6 | `rpc_boundary_alert_cooldown(p_key text, p_window interval) RETURNS boolean` | `evo.evolution_alert_cooldown` | `fn_check_evolution_jid_health` |
| 7 | `rpc_boundary_reprocess_events(p_instance text, p_limit int) RETURNS int` | UPDATE de status em `evo.evolution_webhook_events_v2` p/ reprocesso | `fn_reprocess_pending_webhook_events`, `fn_reprocess_instance_webhook_events` |
| 8 | **§mídia** — já existem e são adotadas como contrato: `evo.rpc_claim_media_download_batch`, `evo.rpc_complete_media_download`, `evo.rpc_fail_media_download` (fila `evo.media_download_queue` é do dono) | — | `zapp.rpc_claim_media_download_batch`, `zapp.rpc_complete_media_download`, `zapp.rpc_fail_media_download` |
| 9 | **§eventos-de-grupo/presença** — já em forma de RPC: `evo.fn_mark_status_viewed`, `evo.fn_touch_contact_presence`, `evo.fn_upsert_group_from_event`, `evo.fn_upsert_group_participants` | — | wrappers `zapp.zapp_*` homônimos |

As linhas 8–9 entram na v1 **com o nome atual** (allowlist nominal); renomear para
`rpc_boundary_*` é opcional e só vale a pena se feito junto com o refino de métrica.

## Leituras (15 fns) — fora deste contrato

`fn_get_evolution_health_summary`, `fn_restore_integrity_check`, `fn_resolve_stale_connection_alerts`,
`fn_sync_instance_registry_status`, `fn_system_health_score`, `fn_webhook_pipeline_score`,
`fn_zapp_web_smoke_test_v2`, `get_platform_health`, `rpc_dr_health_check`, `rpc_pipeline_dashboard`,
`rpc_run_full_test_suite`, `rpc_platform_maintenance` (mv_daily_kpis), `rpc_refresh_daily_metrics`
(mv_daily_metrics), `fn_normalize_send_jid` (lid_phone_map/contact_identity), `fn_cron_guardian` /
`fn_health_preflight` / `fn_score_v2_pipeline` (chamam fns de health evo — viram RPC de leitura ou
view). Destino: **views de contrato `public.evo_*`** (E78) com `security_invoker=on` e grant só de
SELECT. Zerar a citação `evo.` nessas fns é trabalho do E62 usando as views, não RPCs de escrita.

## Segurança (obrigatório)

- `SECURITY DEFINER`, owner `postgres`, `SET search_path = evo, pg_catalog`
- `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO zapp_writer` (E53; papel ainda não existe)
- pgTAP (E54): `zapp_writer` sem DML direto em `evo.*`; escrita via RPC passa

## Refino do `ops.fn_boundary_audit` (mesma regra do lado evo→zapp)

I2 passa a ignorar citações da superfície declarada:

```sql
... AND regexp_replace(p.prosrc, 'evo\.(rpc_boundary_[a-z_]+|rpc_(claim|complete|fail)_media_download|fn_mark_status_viewed|fn_touch_contact_presence|fn_upsert_group_(from_event|participants))', '', 'g') ~* '\mevo\.'
```

Allowlist só do que está enumerado neste doc + schema-registry (E45); gate compara doc × `pg_proc`.

## Evidência de pronto (E52)

- [x] Documento com a lista de RPCs e disposição das 40 fns — este arquivo
- [ ] RPCs 1–7 criadas em migration no repo dono de `evo` + `zapp_writer` (E53)
- [ ] E62: repontar as 9 escritoras + zerar leituras via views E78 → I2=0 (pela métrica refinada)

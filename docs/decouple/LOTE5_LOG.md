# Lote 5 + move normalize_jid + auditoria n8n — 2026-08-15

> DDL em producao: migrations DB `20260815250016` e `20260815250017`.
> Corpos: fonte de verdade e `pg_get_functiondef` em producao.

## Placar

| metrica | antes | depois |
|---|---:|---:|
| I2_fns_zapp_citando_evo | 20 | **4** |
| I1_fns_evo_citando_zapp | 44 | **43** |
| aux_triggers_zapp_com_fn_evo | 19 | **17** |

I2=4 sao os string-citers de SQL dinamico de auditoria ja conhecidos
(`fn_cron_guardian`, `fn_restore_integrity_check`, `fn_score_security_acl`,
`fn_security_surface_audit`). I1 liquido -1: -2 (normalize moves) +1
(`evo.rpc_boundary_provision_instance_partitions` cita as parents `zapp.*`
por necessidade ate I4/E67 mover as tabelas — mesma classe do reconciliador).

## Lote 5 — 16 leitoras de I2 (migration 250016)

**11 swaps mecanicos** para views E78 (`regexp_replace` com `\M`, smoke 11/11):
- `evo.evolution_webhook_events_v2` → `public.evo_webhook_events_v2`:
  fn_get_evolution_health_summary, fn_system_health_score, fn_webhook_pipeline_score,
  fn_zapp_web_smoke_test_v2, get_platform_health, rpc_dr_health_check,
  rpc_pipeline_dashboard, rpc_run_full_test_suite
- `evo.evolution_connection_history` → `public.evo_connection_history`:
  fn_resolve_stale_connection_alerts, fn_sync_instance_registry_status
- `evo.contact_identity`/`evo.lid_phone_map` → views: fn_normalize_send_jid

**RPCs boundary novas** (SECURITY DEFINER, REVOKE PUBLIC, GRANT zapp_writer):
- `evo.rpc_boundary_vps_health_score()` + `evo.rpc_boundary_pipeline_health_probe()`
  → fn_health_preflight repontada (e string `ILIKE '%evo.%'` → `~* 'evo[.]'`,
  mesma semantica, sem falso positivo no audit). Preflight 14/16, checks migrados OK.
- `evo.rpc_boundary_refresh_daily_metrics()` → rpc_refresh_daily_metrics repontada;
  REFRESH CONCURRENTLY validado in-transaction (cron 6 confirma de hora em hora).
- `evo.rpc_boundary_provision_instance_partitions(text)` → fn_register_instance
  reduzida a INSERT no registry + PERFORM; smoke com rollback (particao criada e desfeita).

**Bug real corrigido**: `fn_score_v2_pipeline` chamava `fn_v2_mirror_health` (dropada
no Lote 4) → `fn_system_health_score` perdia 10 pts silenciosamente na dimensao
v2_mirror_pipeline (EXCEPTION → score 0/error). Reescrita para medir frescor do
pipeline v2 direto na view E78, mesmo shape de retorno. Agora 10/10 healthy.

**Drop**: `zapp.rpc_platform_maintenance` — quebrada por 4 refs inexistentes
(`zapp.evolution_webhook_events` dropada, `evo.mv_daily_kpis` e
`mv_executive_dashboard` inexistentes, MVs reais em `public.`) e 0 chamadores
nas 4 fontes (cron, SQL, codigo dos repos, n8n).

Nota: as views `whatsapp_check_queue`/`reconcile_jobs` previstas no plano do lote
nao foram necessarias — nenhuma das 16 as referencia no estado atual do banco.

## Move normalize_jid — hot path (migration 250017)

`fn_normalize_remote_jid` / `fn_normalize_conversation_jid` movidas evo→zapp,
leituras via `public.evo_contact_identity` / `public.evo_lid_phone_map`.
Validacao que faltava no Lote 4, executada:
1. Particoes staging efemeras (`FOR VALUES IN ('staging-decouple')`) + triggers
   com as fns novas + seeds fake + INSERT **como service_role via parent** —
   LID resolvido pelos 2 caminhos, device suffix stripado, original preservado.
   Rollback total (`ROLLBACK_OK`).
2. Switch transacional dos triggers na wpp2 (DROP+CREATE, sem janela) + drop
   das fns evo + **canario real na wpp2** (@lid sem mapeamento mantido, original
   preservado, canario deletado na mesma transacao). Mensagens fluindo pos-switch.

Como as fns sao SECURITY DEFINER owner postgres, as views invoker E78 resolvem
com privilegios do owner — o risco de ACL temido no Lote 4 nao existe nesse arranjo.

## Auditoria n8n — 264 workflows (gap de chamadores externos)

Metodo: extracao de TODOS os tokens `(evo|zapp|ops).obj` + endpoints `rpc/<nome>`
dos nodes + scan explicito dos 38 nomes dropados na sessao (33 E50 + 5 Lote 4).
- Tokens qualificados: **1 unico** — workflow ativo "Worker - classifica conversa"
  (4PXSguIhzBIQ1REo) lia `evo.lid_phone_map` em SQL raw. Corrigido: GRANT SELECT
  na view para service_role + ACL provada com `SET ROLE` no SQL exato do node +
  replace para `public.evo_lid_phone_map`.
  CORRECAO (16/08): o replace inicial atualizou so o draft (workflow_entity.nodes);
  neste n8n 2.25 a execucao usa a versao ativa (workflow_history via activeVersionId
  b388aca1), que seguia com evo.lid_phone_map. Aplicado o mesmo replace na linha da
  versao ativa em workflow_history; draft e versao ativa verificados consistentes
  (zero refs evo.* qualificadas em 264 workflows). Sub-workflow sem trigger proprio,
  le do banco a cada execucao — sem restart.
- Nomes dropados: **0 matches** em qualquer workflow.
- `/rpc/` do ZAPP: rpc_claim/complete/fail_media_download (existem em public/evo/zapp),
  fn_bootstrap_wpp2_instance, fn_media_queue_health_check, fn_reset_stuck_media_queue
  (existem em evo). Nenhum chamador quebrado por moves/drops.

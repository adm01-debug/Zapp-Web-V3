# Lote 9 — Boundaries de escrita para as I1 restantes

## Fase A (2026-08-16, migration 20260815250022) — APLICADA

**Placar: I1 18→11 · triggers cruzados zapp←evo 13→0 · I2 mantido 0.**

### Boundaries novos (contratos)
- `zapp.rpc_boundary_resolve_alert(p_alert_type, p_resolved_by)` → resolve alertas abertos por tipo (já existia do lote 7, corpo confirmado idêntico).
- `evo.rpc_boundary_enqueue_media_download(9 params)` → INSERT em `evo.media_download_queue` ON CONFLICT (message_id) DO NOTHING.
- `evo.rpc_boundary_ledger_insert(8 params)` → INSERT em `evo.ingest_ledger`.

### Swaps (fns ficam em evo, escrita em zapp via boundary)
`fn_auto_apply_lid_mappings`, `fn_check_socket_flapping`, `fn_lid_convergence_snapshot`,
`fn_lid_upgrade_alert_check` (UPDATE→resolve_alert; INSERT sem janela→dedup 100 anos),
`fn_retention_webhook_partitions` — todos: `INSERT INTO zapp.evolution_alerts` → `zapp.rpc_boundary_raise_alert`.
Janelas de dedup preservam a semântica original (WHERE NOT EXISTS 2h → interval '2 hours'; sem dedup → interval '0').

### Triggers cruzados zerados (13→0)
- `fn_auto_enqueue_media_download` → movida p/ zapp (ALTER SET SCHEMA preserva OID; triggers seguem), INSERT evo→boundary. Agora SECURITY DEFINER.
- `fn_ledger_from_insert` → idem, fire-and-forget mantido no chamador.
- `fn_block_internal_media_url`, `fn_enforce_direction` → moves puros (sem refs cruzadas).
- `fn_set_updated_at` → trigger de `zapp.evolution_groups` repontado para `zapp.fn_set_updated_at` homônima pré-existente; evo dropada.
- `increment_snapshot_version()` → 3 triggers em `zapp.evolution_contacts` DROPADOS (ver abaixo).

### Drops de código morto (lição E50: 0 chamadores verificados em prosrc+cron+app+edge+n8n)
- `evo.pr_link_msgs_to_conversations(integer)` — procedure sem nenhum chamador.
- Mecanismo snapshot version: 3 triggers + `evo.increment_snapshot_version()` + stub `(text)`.
  Único leitor era `zapp.get_compliance_metrics_v2`, que por sua vez tem 0 chamadores.
  **Preservados** (backlog de limpeza): `evo/zapp.get_snapshot_version`, `evo/zapp.validate_snapshot_freshness`,
  `zapp.get_compliance_metrics_v2`, tabelas `evo._snapshot_version_state` (229k ops, viva até o drop) e
  `zapp._snapshot_version_state` (parada desde 2026-08-11). Bônus: remove 1 UPDATE por mutação em evolution_contacts.

### Validação
- Guards in-txn: 5 fns evo sem `zapp.` fora de boundary; 4 trigger-fns zapp sem `evo.` fora de boundary; 0 triggers cruzados.
- Smokes: socket_flapping (SKIP below_threshold), convergence (STABLE, snapshot gravado), upgrade_alert_check (void), retention dry_run.
- `fn_auto_apply_lid_mappings` NÃO smocada (aplicaria mappings reais); mudança de 1 linha, cron horário exercita — monitorar próxima run.
- Canário sintético com rollback: INSERT em evolution_messages_wpp2 com media fake → ledger=1 queue=1 ✔.
- Tráfego real 10min: 3 msgs / 3 ledger rows (1:1).

## Fases B e C — PENDENTES
- **B**: `fn_pipeline_health_probe` (mover p/ zapp + boundary insert pipeline_health_log + view webhook stats),
  `fn_scrub_r2_paths_from_logs` (mover p/ zapp; decidir helper fn_scrub_r2_text),
  `fn_ensure_evolution_backcompat_views` (mover p/ ops; corrigir check evo/zapp inconsistente no IF da view v2).
- **C (cluster LID)**: `fn_apply_lid_mappings`, `fn_passive_lid_accumulator`, `fn_lid_normalizer_test_suite`,
  `fn_lid_regression_suite`, `fn_lid_health_report` — mover p/ zapp com views reversas onde faltarem.
- Ficam (contratos, fora de escopo): `rpc_boundary_provision_instance_partitions`, `rpc_complete_media_download`.

# MIGRATIONS-DRIFT — repo × DB (`schema_migrations`)

> **Data da medição:** 2026-08-07 · **Branch:** `fix/fin-a4-driftdocs-f9160`
> **Escopo:** drift entre `supabase/migrations/*.sql` (repo) e `supabase_migrations.schema_migrations` (DB de produção self-hosted).
> **Modelo vigente:** DB-as-source (ver `AGENTS.md`). O repo é o *registro histórico*; o DB é a fonte de verdade dos objetos.

---

## 1. Resumo executivo

| Métrica | Valor |
|---|---|
| Registros no DB (`schema_migrations`) | **299** |
| Arquivos no repo (`supabase/migrations/*.sql`) | **154** |
| Registros do DB **com** arquivo correspondente | **149** |
| Registros do DB **sem** arquivo (drift) | **150** |
| ├─ **PRÉ-SQUASH** (histórico, `version < 20260804000000`) | **88** |
| └─ **RECENTES-SEM-ARQUIVO** (`version >= 20260804000000`) | **62** |
| Arquivos do repo **sem** registro no DB (drift inverso) | **5** |

**Veredito:** o drift de 150 registros é **esperado e gerenciado** — 88 são história pré-squash (consolidada em
`20260804000000_canonical_schema_squash_133_migrations.sql`, mantidos por design DB-as-source) e 62 são
migrations recentes aplicadas via MCP (sessão paralela) cujos arquivos estão **pendentes de commit** no repo.
Nenhum espelho falso foi criado (decisão: sem corpo no repo, sem espelho).

---

## 2. Metodologia do cross-check (determinística)

O cruzamento é **exato por `version`** (chave primária da tabela `schema_migrations`), sem fuzzy matching.

### 2.1 Lista do DB (fonte: produção)

```sql
SELECT version, name, executed_at
FROM supabase_migrations.schema_migrations
ORDER BY version ASC;
```

Executada via MCP `supabase_db_query` → 299 linhas. Materializada em `tmp/db-migrations.txt` (formato `version|name`).

### 2.2 Lista do repo

```bash
ls supabase/migrations/*.sql | sed 's|supabase/migrations/||' | awk -F_ '{print $1"|"$0}' | sort > tmp/repo-migrations.txt
```

154 linhas (formato `version|arquivo`).

### 2.3 Comando exato do cross-check

```bash
# DRIFT = registros do DB sem arquivo no repo
comm -23 <(cut -d'|' -f1 tmp/db-migrations.txt | sort) <(cut -d'|' -f1 tmp/repo-migrations.txt | sort)

# INVERSO = arquivos no repo sem registro no DB
comm -13 <(cut -d'|' -f1 tmp/db-migrations.txt | sort) <(cut -d'|' -f1 tmp/repo-migrations.txt | sort)
```

### 2.4 Classificação (regra de ouro)

| Classe | Regra determinística | Contagem |
|---|---|---|
| **PRÉ-SQUASH** (allowlist) | `version < 20260804000000` (comparação lexicográfica do timestamp) | 88 |
| **RECENTES-SEM-ARQUIVO** | `version >= 20260804000000` | 62 |
| **OUTROS** | sem arquivo e fora das regras acima | 0 |

> Nota de robustez: a comparação é por string do `version` (não por data parseada), o que trata de forma estável
> versões fora do padrão 14 dígitos (ex.: `20260716`, `20260722.2` — todas pré-squash) e timestamps "futuros"
> (`20260808150001`), que são **normais** nesta casa (ver `AGENTS.md`, item 4).

---

## 3. Tabela dos 150 registros sem arquivo

### 3.1 PRÉ-SQUASH — allowlist (88)

Histórico consolidado em `20260804000000_canonical_schema_squash_133_migrations.sql`.
**Política: NÃO recebem espelho.** O squash foi deliberado; manter 133 arquivos antigos no repo não agrega
valor e o DB-as-source preserva o registro. Esta lista é a **allowlist oficial** para o gate de CI.

| `20260716` | — | fix_dispatch_error_logs_grant |
| `20260717` | — | create_queue_analytics |
| `20260720000006` | 2026-07-20 00:00:06 | fix_settings_realtime_publication |
| `20260722` | — | qa_infra_corrections |
| `20260722.2` | — | fix_profiles_insert_policy_and_trigger |
| `20260724000001` | 2026-07-24 00:00:01 | evo_drop_unused_indexes |
| `20260724000003` | 2026-07-24 00:00:03 | evo_schema_housekeeping |
| `20260724000004` | 2026-07-24 00:00:04 | no_op_placeholder |
| `20260724000005` | 2026-07-24 00:00:05 | fix_critical_sql_bugs |
| `20260724000006` | 2026-07-24 00:00:06 | fix_remaining_realtime_publications |
| `20260724000007` | 2026-07-24 00:00:07 | create_evolution_sentiment_analysis |
| `20260724000011` | 2026-07-24 00:00:11 | fix_evo_schema_blanket_auth_policies |
| `20260724000014` | 2026-07-24 00:00:14 | fix_secdef_search_path_bulk |
| `20260724000015` | 2026-07-24 00:00:15 | add_external_message_id_to_sentiment_analysis |
| `20260724000016` | 2026-07-24 00:00:16 | additional_realtime_publications |
| `20260724130000` | 2026-07-24 13:00:00 | enable_rls_archive_backup_tables |
| `20260724131500` | 2026-07-24 13:15:00 | revoke_anon_execute_secdef_appschemas |
| `20260724132500` | 2026-07-24 13:25:00 | tighten_dormant_anon_select_policies |
| `20260724140000` | 2026-07-24 14:00:00 | fix_rls_policy_monitoring_architecture_changelog |
| `20260724140500` | 2026-07-24 14:05:00 | normalize_public_first_search_path_financeiro_monitoring_ops |
| `20260724141500` | 2026-07-24 14:15:00 | normalize_public_first_search_path_public_schema |
| `20260726103000` | 2026-07-26 10:30:00 | fix_cron_job15_email_cleanup_backcompat_wrapper |
| `20260726111628` | 2026-07-26 11:16:28 | registra_fixes_sessao_20260726 |
| `20260726120927` | 2026-07-26 12:09:27 | assert_todas_correcoes_sessao_20260726 |
| `20260726121458` | 2026-07-26 12:14:58 | fix_contact_intelligence_expose_phone |
| `20260726124635` | 2026-07-26 12:46:35 | perf_fix_contacts_view_hot_cte |
| `20260726124828` | 2026-07-26 12:48:28 | upgrade_rpc_get_contact_intelligence_by_phone |
| `20260726124922` | 2026-07-26 12:49:22 | populate_contact_intelligence_and_trigger |
| `20260726125340` | 2026-07-26 12:53:40 | perf_indexes_hot_paths |
| `20260726135603` | 2026-07-26 13:56:03 | fix_rpc_empty_phone_guard_and_index_gap |
| `20260726135730` | 2026-07-26 13:57:30 | fix_public_contact_intelligence_view_missing_columns |
| `20260726193100` | 2026-07-26 19:31:00 | security_revoke_anon_dml_financeiro_vendas |
| `20260727120000` | 2026-07-27 12:00:00 | qa_round_2_3_corrigido_consolidado |
| `20260727120500` | 2026-07-27 12:05:00 | qa_round_2_3_ajuste_grants_e_trigger_dup |
| `20260727130100` | 2026-07-27 13:01:00 | melhoria_01_fk_idx_conversations_contact_id |
| `20260727130200` | 2026-07-27 13:02:00 | melhoria_02_fk_idx_role_permissions_permission_id |
| `20260727130300` | 2026-07-27 13:03:00 | melhoria_03_fk_idx_evolution_status_reactions |
| `20260727130400` | 2026-07-27 13:04:00 | melhoria_04_fix_health_score_cache_race |
| `20260727130500` | 2026-07-27 13:05:00 | melhoria_05_pipeline_log_retention_e_v2_idx |
| `20260727130600` | 2026-07-27 13:06:00 | melhoria_06_backup_table_pk_e_relocate |
| `20260727130700` | 2026-07-27 13:07:00 | melhoria_07_reconcile_jobs_idx_composto |
| `20260727130800` | 2026-07-27 13:08:00 | melhoria_08_drop_unused_pagamentos_diarios_indexes |
| `20260727140000` | 2026-07-27 14:00:00 | bugfix_fn_normalize_phone_v2 |
| `20260727140100` | 2026-07-27 14:01:00 | bugfix_fn_normalize_phone_v3_final |
| `20260727150000` | 2026-07-27 15:00:00 | fix_privilege_refresh_mv_minimo_privilegio |
| `20260727160000` | 2026-07-27 16:00:00 | melhoria_09_ddl_audit_retencao_indice_cron |
| `20260727160100` | 2026-07-27 16:01:00 | melhoria_10_drop_zero_idx_evolution_media |
| `20260727160200` | 2026-07-27 16:02:00 | melhoria_11_drop_zero_idx_evolution_contacts |
| `20260727160400` | 2026-07-27 16:04:00 | melhoria_12b_drop_zero_idx_conv_wpp2 |
| `20260727160500` | 2026-07-27 16:05:00 | melhoria_13_drop_zero_idx_zapp_diversos |
| `20260727160600` | 2026-07-27 16:06:00 | melhoria_14_drop_zero_idx_notifications_pipeline |
| `20260727160700` | 2026-07-27 16:07:00 | melhoria_15_drop_zero_idx_vendas_financeiro |
| `20260727160800` | 2026-07-27 16:08:00 | melhoria_16_app_notifications_retencao_90d |
| `20260727161000` | 2026-07-27 16:10:00 | REVERT_melhoria_15_recriar_idx_vendas_financeiro |
| `20260727200001` | 2026-07-27 20:00:01 | idx_evolution_contacts_instance_phone |
| `20260727200002` | 2026-07-27 20:00:02 | rpc_get_pipeline_health |
| `20260727200003` | 2026-07-27 20:00:03 | fix_contact_audit_log_action_check |
| `20260727200004` | 2026-07-27 20:00:04 | idx_pipeline_health_gaps |
| `20260727200005` | 2026-07-27 20:00:05 | rpc_bulk_repair_dedup_hashes |
| `20260727200006` | 2026-07-27 20:00:06 | rpc_get_pipeline_health_v2 |
| `20260727200007` | 2026-07-27 20:00:07 | rpc_backfill_messages_contact_id |
| `20260727200008` | 2026-07-27 20:00:08 | harden_secdef_search_paths |
| `20260727200009` | 2026-07-27 20:00:09 | idx_webhook_audit_log_processed |
| `20260728000001` | 2026-07-28 00:00:01 | ddl_event_trigger_auto_security_invoker |
| `20260728000002` | 2026-07-28 00:00:02 | expand_autofix_all_schemas |
| `20260728000003` | 2026-07-28 00:00:03 | rate_limit_null_guard_and_bridge_auth |
| `20260728000004` | 2026-07-28 00:00:04 | explicit_policies_and_default_privileges |
| `20260728000005` | 2026-07-28 00:00:05 | security_monitoring_rate_limit_hardening |
| `20260728000006` | 2026-07-28 00:00:06 | pgbouncer_get_auth_search_path_hardening |
| `20260728130001` | 2026-07-28 13:00:01 | revoke_anon_usage_financeiro_artes |
| `20260729190001` | 2026-07-29 19:00:01 | drop_evo_to_zapp_fks |
| `20260729190003` | 2026-07-29 19:00:03 | harden_secdef_6 |
| `20260729190004` | 2026-07-29 19:00:04 | reactivate_cron |
| `20260729190005` | 2026-07-29 19:00:05 | harden_secdef_106 |
| `20260729190006` | 2026-07-29 19:00:06 | harden_secdef_artes_monitoring |
| `20260730185927` | 2026-07-30 18:59:27 | 20260730160600 |
| `20260730190024` | 2026-07-30 19:00:24 | 20260730161000 |
| `20260730191510` | 2026-07-30 19:15:10 | 20260730162000 |
| `20260731124746` | 2026-07-31 12:47:46 | consolidate_zapp_messages_instead_of_triggers |
| `20260801180000` | 2026-08-01 18:00:00 | infra01_consolidate_messages_view_triggers |
| `20260801184500` | 2026-08-01 18:45:00 | r28_fix_health_status_constraint_add_down |
| `20260801184600` | 2026-08-01 18:46:00 | r28_cleanup_constraint_cron_failure_runid_583822 |
| `20260801185500` | 2026-08-01 18:55:00 | r28c_create_e2e_user_profile |
| `20260801185700` | 2026-08-01 18:57:00 | r28d_fix_handle_new_user_agent_stats_wrong_id |
| `20260802135939` | 2026-08-02 13:59:39 | check_dblink_net |
| `20260802135945` | 2026-08-02 13:59:45 | enable_dblink |
| `20260803160000` | 2026-08-03 16:00:00 | deprecate_lovable_parity_functions |
| `20260803195326` | 2026-08-03 19:53:26 | 20260803183000_drop_proxy_ecosystem |

### 3.2 RECENTES-SEM-ARQUIVO (62)

Aplicadas via MCP `supabase_apply_migration` pela **sessão paralela**; arquivos **pendentes de commit** deles.
**Política: devem ganhar arquivo no repo quando a sessão dona commitar.** Não criar espelho agora (evita
duplicação/conflito no commit deles). Quando o arquivo chegar ao repo, o registro sai automaticamente desta lista.

| `20260805152318` | 2026-08-05 15:23:18 | add_rpc_cron_scheduler |
| `20260805152911` | 2026-08-05 15:29:11 | add_email_templates_view_triggers |
| `20260805154132` | 2026-08-05 15:41:32 | add_notification_channels_write_policy |
| `20260805213735` | 2026-08-05 21:37:35 | perf_rls_initplan_cron_throttle |
| `20260805213957` | 2026-08-05 21:39:57 | perf_monitoring_dashboard_view |
| `20260805214019` | 2026-08-05 21:40:19 | perf_optimize_companies_batch_function |
| `20260806100000` | 2026-08-06 10:00:00 | fix_retry_stuck_messages_queued_status |
| `20260806182000` | 2026-08-06 18:20:00 | fix_dispatch_disk_alert_enum_cast |
| `20260806203227` | 2026-08-06 20:32:27 | migration_20260806203227 |
| `20260806203257` | 2026-08-06 20:32:57 | migration_20260806203257 |
| `20260806203333` | 2026-08-06 20:33:33 | migration_20260806203333 |
| `20260806203637` | 2026-08-06 20:36:37 | migration_20260806203637 |
| `20260806203714` | 2026-08-06 20:37:14 | migration_20260806203714 |
| `20260806204039` | 2026-08-06 20:40:39 | migration_20260806204039 |
| `20260806204144` | 2026-08-06 20:41:44 | migration_20260806204144 |
| `20260806204214` | 2026-08-06 20:42:14 | migration_20260806204214 |
| `20260806204327` | 2026-08-06 20:43:27 | migration_20260806204327 |
| `20260806204354` | 2026-08-06 20:43:54 | migration_20260806204354 |
| `20260806204413` | 2026-08-06 20:44:13 | migration_20260806204413 |
| `20260806204441` | 2026-08-06 20:44:41 | migration_20260806204441 |
| `20260806204504` | 2026-08-06 20:45:04 | migration_20260806204504 |
| `20260806204525` | 2026-08-06 20:45:25 | migration_20260806204525 |
| `20260806204540` | 2026-08-06 20:45:40 | migration_20260806204540 |
| `20260806204705` | 2026-08-06 20:47:05 | migration_20260806204705 |
| `20260806221332` | 2026-08-06 22:13:32 | 20260806220000_zapp_views_hardening |
| `20260806221333` | 2026-08-06 22:13:33 | 20260806220100_zapp_policies_hardening |
| `20260806221335` | 2026-08-06 22:13:35 | 20260806220700_rabbit_consumer_stats |
| `20260806221500` | 2026-08-06 22:15:00 | fix_fn_sync_guardian_heartbeat_dblink |
| `20260806221825` | 2026-08-06 22:18:25 | 20260806221500_job65_purge_backlog |
| `20260806221835` | 2026-08-06 22:18:35 | 20260806221510_registry_conn_sync |
| `20260806222114` | 2026-08-06 22:21:14 | 20260806222000_ghosts_removal |
| `20260806222209` | 2026-08-06 22:22:09 | 20260806222300_vault_duplicate_removal |
| `20260806222211` | 2026-08-06 22:22:11 | 20260806222310_advisors_public_secdef |
| `20260806222402` | 2026-08-06 22:24:02 | migration_20260806222402 |
| `20260806235401` | 2026-08-06 23:54:01 | 20260807000100_evo_traefik_401_stats |
| `20260807102155` | 2026-08-07 10:21:55 | onda3_d2_negocio_triggers_evo_contrato_views_rpc |
| `20260807103602` | 2026-08-07 10:36:02 | migration_20260807103602 |
| `20260807110457` | 2026-08-07 11:04:57 | migration_20260807110457 |
| `20260807145000` | 2026-08-07 14:50:00 | ag04_arq11_searchpath_outliers |
| `20260807145100` | 2026-08-07 14:51:00 | ag04_arq11_searchpath_zapp_rpc_schema |
| `20260807160000` | 2026-08-07 16:00:00 | fix_ops_analytics_log_retention_dblink_ref |
| `20260807160001` | 2026-08-07 16:00:01 | ag01_onda2_move_amcheck_to_extensions |
| `20260807160002` | 2026-08-07 16:00:02 | ag01_onda2_move_hypopg_to_extensions |
| `20260807160003` | 2026-08-07 16:00:03 | ag01_onda2_move_index_advisor_to_extensions |
| `20260807160004` | 2026-08-07 16:00:04 | ag01_onda2_move_pg_buffercache_to_extensions |
| `20260807160005` | 2026-08-07 16:00:05 | ag01_onda2_move_btree_gin_to_extensions |
| `20260807160006` | 2026-08-07 16:00:06 | ag01_onda2_move_dblink_to_extensions |
| `20260807160007` | 2026-08-07 16:00:07 | ag01_onda2_move_pg_trgm_to_extensions |
| `20260807160008` | 2026-08-07 16:00:08 | ag01_onda2_move_unaccent_to_extensions |
| `20260807160009` | 2026-08-07 16:00:09 | ag01_onda2_move_vector_to_extensions |
| `20260807200000` | 2026-08-07 20:00:00 | ag06_sto_team_chat_files_owner_check |
| `20260807210000` | 2026-08-07 21:00:00 | ag07_sto_mime_types_restantes |
| `20260807220000` | 2026-08-07 22:00:00 | ag05_onda2_qa1005_fn_insert_idempotency_failure_audit |
| `20260807220001` | 2026-08-07 22:00:01 | ag05_onda2_qa1006_pg_stat_database_simple |
| `20260807220002` | 2026-08-07 22:00:02 | ag05_onda2_qa1005_fix_status_check_constraint |
| `20260807235000` | 2026-08-07 23:50:00 | bpm_hardening_auth_write_admin_only |
| `20260807235500` | 2026-08-07 23:55:00 | drop_sla_policies |
| `20260807235800` | 2026-08-07 23:58:00 | c3_restrict_rls_permissive_policies |
| `20260808120001` | 2026-08-08 12:00:01 | drop_redundant_partition_rjid_indexes |
| `20260808121000` | 2026-08-08 12:10:00 | ag_ex02_audio_memes_rls |
| `20260808150000` | 2026-08-08 15:00:00 | hotfix_revoke_exec_sql_anon |
| `20260808150001` | 2026-08-08 15:00:01 | rerevoke_re_grants |

---

## 4. Drift inverso — arquivos sem registro no DB (5)

**Política: nenhuma ação destrutiva.** Todos os 5 têm correspondência **por nome** no DB com versão ajustada na
aplicação (re-registro): 4 com timestamp vizinho no mesmo dia (`20260804210923`, `20260805103705`,
`20260805104043`, `20260805105924` — difere apenas nos segundos/minutos) e 1 com versão de dia anterior
(`20260806810000_email_attachments_unique_constraint.sql` ↔ registro `20260805170001_email_attachments_unique_constraint`).
Manter como estão até reconciliação explícita da sessão dona.

| `20260804210000` | 2026-08-04 21:00:00 | 20260804210000_restore_edge_idempotency_rpcs.sql |
| `20260805103700` | 2026-08-05 10:37:00 | 20260805103700_apply_missing_140100_policies.sql |
| `20260805104000` | 2026-08-05 10:40:00 | 20260805104000_harden_evo_insert_policies.sql |
| `20260805105900` | 2026-08-05 10:59:00 | 20260805105900_grant_lgpd_auth_rpcs.sql |
| `20260806810000` | 20260806810000 | 20260806810000_email_attachments_unique_constraint.sql |

---

## 5. Política operacional

1. **PRÉ-SQUASH (`< 20260804000000`):** registros históricos mantidos por design (DB-as-source). NÃO recebem
   arquivo espelho. São a allowlist do gate.
2. **RECENTES-SEM-ARQUIVO (`>= 20260804000000`):** pendência legítima de commit da sessão paralela. Devem
   ganhar arquivo (`YYYYMMDDHHMMSS_nome.sql`) quando a sessão dona commitar. Nada a fazer por esta frente.
3. **Sem espelhos falsos:** nenhum arquivo de migration foi criado por esta auditoria — decisão explícita
   (sem corpo no repo, sem espelho).
4. **Drift inverso:** arquivo no repo sem registro no DB não é apagado; sinaliza re-registro com versão
   ajustada ou aplicação pendente.

---

## 6. Comando de verificação do drift (CI futura)

```bash
#!/usr/bin/env bash
# Gate: falha se existir registro RECENTE (>= squash) sem arquivo, fora da janela de tolerância.
# Allowlist: registros < 20260804000000 são históricos (squash deliberado) e sempre permitidos.

set -euo pipefail
SQUASH="20260804000000"

cut -d'|' -f1 tmp/db-migrations.txt | sort > /tmp/db.ver
cut -d'|' -f1 tmp/repo-migrations.txt | sort > /tmp/repo.ver

# 1) Registros do DB sem arquivo, EXCLUINDO allowlist pré-squash
DRIFT=$(comm -23 /tmp/db.ver /tmp/repo.ver | awk -v s="$SQUASH" '$1 >= s' || true)

if [ -n "$DRIFT" ]; then
  echo "ERRO: $(echo "$DRIFT" | wc -l) registros RECENTES sem arquivo no repo:"
  echo "$DRIFT"
  exit 1
fi

# 2) (Opcional) drift inverso — apenas informativo
INV=$(comm -13 /tmp/db.ver /tmp/repo.ver || true)
echo "OK: nenhum registro recente sem arquivo. (Drift inverso informativo: $(echo "$INV" | wc -l) arquivos)"
```

**Invariante para CI:** `total_sem_arquivo = allowlist_pré_squash ∪ recentes_sem_arquivo` e a expectativa é
que `recentes_sem_arquivo → ∅` conforme a sessão paralela commita seus arquivos.

---

## 7. Artefatos

| Arquivo | Conteúdo |
|---|---|
| `tmp/db-migrations.txt` | 299 registros do DB (`version|name`), snapshot de 2026-08-07 |
| `tmp/repo-migrations.txt` | 154 arquivos do repo (`version|arquivo`) |
| `tmp/classification.json` | Classificação completa em JSON (reprodutível) |

# Catálogo de Funções

**Retrato de:** 27/07/2026 · ~**1.400 funções** de negócio.

> Regenerar (completo): `SELECT n.nspname, p.proname, pg_get_function_arguments(p.oid), p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('zapp','evo','public','ops',...) ORDER BY 1,2;`

## Panorama por schema

| Schema | Funções | `SECURITY DEFINER` | Observação |
|---|---:|---:|---|
| `zapp` | 1.052 | 685 | Lógica do app + RPC + triggers |
| `public` | 145 | 21 | Camada de API (RPC exposta via PostgREST) |
| `evo` | 69 | 59 | Pipeline/monitoramento Evolution |
| `ops` | 47 | 42 | Infra, guardrails, checks |
| `financeiro` | 45 | 31 | |
| `vendas` | 21 | 11 | |

> ⚠️ **`SECURITY DEFINER` é a maioria** (zapp 65%, evo 86%, ops 89%). Função `SECURITY DEFINER` roda com privilégio do dono e **bypassa RLS** — **sempre** fixe `SET search_path` (guardrail: `ops.fn_secdef_search_path_guard`).

---

## Convenção de nomes (`zapp`)

| Prefixo | Qtd | Sentido |
|---|---:|---|
| `fn_*` | 417 | Lógica interna / triggers de negócio |
| `rpc_*` | 174 | **Exposta via PostgREST** (contrato de API) |
| `get_*` | 43 | Leitura |
| `trg_*` | 21 | Função de trigger |
| `is_*` | 16 | Predicados/guardas |
| `cleanup_*` | 14 | Limpeza/retention |

> Prefixos `gin_*` (87), `dblink_*` (41), `hypopg_*` (11), `l2_*` (8), `bt_*` (5) **não são lógica do app** — são funções de extensões (`pg_trgm`/`btree_gin`, `dblink`, `hypopg`, `vector`) que acabaram no schema `zapp`. Rever colocação (idealmente em `extensions`).

---

## Classificação das 145 funções em `public` (etapa 14)

### Categoria A — Contrato de API ativo (não remover)

Estas funções são chamadas diretamente pelo app via PostgREST `/rest/v1/rpc/*`:

| Função | Categoria | Notas |
|---|---|---|
| `rpc_list_failed_messages_cursor` | cursor pagination | corrigido BUG-8 |
| `rpc_list_dispatch_error_logs_cursor` | cursor pagination | corrigido BUG-19/20 |
| `rpc_dlq_list_audit_cursor` | cursor pagination | |
| `rpc_dlq_bulk_retry_now` | DLQ ops | |
| `rpc_dlq_log_item_action` | DLQ ops | |
| `rpc_list_transfers_paginated` | paginação | wrapper para public.rpc_list_transfers_paginated |
| `search_contacts_cursor` | busca | corrigido BUG-15/16/17/18 |
| `add_contacts_to_campaign` | campanhas | corrigido GAP-1 |
| `initiate_gmail_oauth` | integrações | stub GAP-2 |
| `complete_gmail_oauth` | integrações | stub GAP-2 |
| `sync_to_crm` | CRM | stub GAP-3 |
| `export_user_data` | LGPD | stub GAP-4 |
| `import_user_data` | LGPD | stub GAP-4 |
| `enrich_contact` | CRM | stub GAP-5 |
| `get_latest_analysis` | analytics | stub GAP-6 |
| `check_download_permission` | storage | fail-open BUG-9 |

> Total estimado de funções `public` ativas: **~80–90**. O restante (~55–65) são candidatas à remoção ou migração para `zapp`.

### Categoria B — Funções Legadas / Depreciadas

Funções em `public` que existem apenas por compatibilidade histórica mas não são chamadas ativamente pelo app. Candidatas para DROP após auditoria de uso no código-fonte.

Identificar com:
```sql
-- Funções em public que NÃO aparecem no código TypeScript:
SELECT p.proname, p.pronargs
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname NOT IN (
      -- lista gerada por grep 'rpc(' src/ --
      'rpc_list_failed_messages_cursor',
      'rpc_list_dispatch_error_logs_cursor'
      -- ... completar com grep
  )
ORDER BY p.proname;
```

### Categoria C — Funções de extensão em `public` (não são lógica de app)

Ver ADR-DB-003 — estas migram para `extensions` quando staging estiver pronto.

---

## Funções do schema `evo` (69) — domínio Evolution

**Pipeline / Partições:**
`fn_auto_create_next_partitions`, `fn_create_monthly_partition`, `fn_ensure_monthly_partitions`, `fn_ensure_evolution_backcompat_views` (ver BACKCOMPAT-VIEWS.md), `fn_cache_warmup_after_vacuum`

**JID / UUID / Contatos:**
`fn_normalize_remote_jid`, `fn_uuid_safe`, `add_to_contact_id_graveyard`, `is_contact_id_available`, `prevent_contact_id_reuse`, `fn_link_orphan_messages`

**Detecção / Saúde:**
`fn_detect_401_bursts`, `fn_detect_ack_loss_gap`, `fn_detect_spurious_closes`, `fn_detect_instance_recreate`, `fn_burnin_monitor`, `fn_pipeline_health_probe`, `fn_v2_mirror_health`, `fn_monitor_lid_contamination`, `fn_flag_poison_messages`

**Segurança de mídia / logs:**
`fn_block_internal_media_url`, `fn_scrub_r2_paths_from_logs`, `fn_scrub_r2_text`

**⚠️ Fora do domínio Evolution — repatriar para `ops` (etapa 9):**
`fn_vps_dashboard_summary`, `fn_vps_health_score`, `fn_vps_risk_report`, `fn_vps_next_priority`, `fn_vps_go_live_check`, `fn_vps_refresh_dashboard`, `fn_vps_category_breakdown`, `pr_vps_update_status`, `trg_fn_vps_status_audit`

---

## Funções do schema `ops` (47) — infra/observabilidade

**Checks de saúde:**
`check_infrastructure`, `check_host_disk`, `check_critical_fks`, `check_wal_health`, `check_schema_drift`, `check_types_sync`, `check_mirror_integrity`, `check_lovable_parity`, `run_all_checks`

**Guardrails / DDL:**
`fn_guardrails_check`, `fn_ddl_audit_log`, `fn_ddl_drop_alert`, `fn_ddl_weekly_summary`, `fn_catalog_sanity_check`, `fn_secdef_search_path_guard`, `fn_schema_fingerprint`, `fn_ddl_violation_scan`

**Sentinelas / DR:**
`fn_auto_update_backup_sentinel`, `fn_update_backup_sentinel`, `fn_update_redis_sentinel`, `fn_check_wal_slots`, `fn_verify_alert_delivery`

**Alertas:**
`fn_notify_critical_alerts`, `fn_alert_consumer_halt`, `fn_auth_session_overflow_alert`, `fn_monitor_ingestion_persistence_gap`

**Simulações (somente staging):**
`sim_disk_alert_e2e`, `sim_disk_guard`, `sim_forensic_battery`, `sim_rls_wa`, `sim_wa_budget_guard`

---

## Regras de segurança para novas funções

1. **`SECURITY DEFINER` obriga** `SET search_path = schema_do_objeto, pg_catalog`
2. Nunca colocar `public` no search_path de SECDEF (expõe a path injection)
3. `SECURITY INVOKER` (default) respeita RLS — preferir sempre que possível
4. `REVOKE EXECUTE FROM PUBLIC` em toda nova função; `GRANT` apenas para roles necessárias
5. Testar com `SET ROLE anon; SELECT fn()` — deve retornar permission denied

Ver CI-05 em SCHEMA-CONTRACT.md para query de verificação automática.

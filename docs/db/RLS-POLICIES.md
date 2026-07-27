# RLS e Policies

**Retrato de:** 27/07/2026.

> **Cobertura:** todas as tabelas base dos schemas de negócio têm `rowsecurity=on`. A cobertura de policies é alta.
> Regenerar: `SELECT schemaname, tablename, policyname, cmd, roles, qual FROM pg_policies ORDER BY 1,2;`

## Cobertura por schema

| Schema | Policies | Tabelas com policy | Tabelas (base) |
|---|---:|---:|---:|
| `zapp` | 693 | 314 | 320 |
| `evo` | 411 | 193 | 193 |
| `bpm` | 82 | 41 | 41 |
| `email_app` | 81 | 33 | 33 |
| `ai` | 62 | 31 | 31 |
| `financeiro` | 46 | 16 | 16 |
| `archive` | 30 | 15 | 25 |
| `vendas` | 28 | 14 | 14 |
| `ops` | 20 | 19 | 20 |

> **Nota de segurança:** as views de API (`public`, `zapp`) têm `security_invoker=on`, então o RLS avaliado é o da **tabela base**. Não há bypass de RLS pela fachada de views.

## Tabelas com RLS ligado e **zero policy** (18)

RLS on + zero policy = **deny-all** para `authenticated` (só `service_role`/owner acessa). Cada uma precisa de **policy** OU de um comentário SQL declarando a intenção.

| Schema | Tabela | Disposição recomendada |
|---|---|---|
| `zapp` | **`_lgpd_payload`** | ⚠️ **PII** — auditar exposição e confirmar service_role-only |
| `zapp` | `api_circuit_breaker` | decisão explícita (provável service_role-only) |
| `zapp` | `cookie_probe_log` | service_role-only (documentar) |
| `zapp` | `cookie_probe_pending` | service_role-only (documentar) |
| `zapp` | `fn_health_score_history` | service_role-only (documentar) |
| `zapp` | `lux_system_alerts` | decisão explícita |
| `ops` | `_fn_backups` | frio/backup → service_role-only (documentar) |
| `public` | `_wal_slot_guard_events` | mover para `ops` + policy/comentário |
| `archive` | `_audit_whatsapp_connections_2026_05_04` | backup datado → service_role-only |
| `archive` | `anon_func_grant_backup_20260630` | backup datado → service_role-only |
| `archive` | `anon_grant_backup_20260630` | backup datado → service_role-only |
| `archive` | `anon_invoker_func_backup_20260630` | backup datado → service_role-only |
| `archive` | `anon_schema_usage_backup_20260630` | backup datado → service_role-only |
| `archive` | `fk_orfaos_backup_20260512` | backup datado → service_role-only |
| `archive` | `messages_whatsapp_deprecated_backup_20260705` | backup depreciado → service_role-only |
| `archive` | `migration_progress_log` | ops/histórico → documentar |
| `archive` | `schema_dependency_map` | ops/histórico → documentar |
| `archive` | `wpp_pink_test_metadata_20260512` | artefato de teste → arquivar/remover |

> A maioria (archive/ops) é frio/interno acessado só por `service_role` — baixo risco. A exceção prioritária é **`zapp._lgpd_payload`** (PII).

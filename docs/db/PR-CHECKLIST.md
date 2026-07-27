# Pull Request Checklist — Database Changes

> Checklist obrigatório para PRs que alteram o banco de dados.

---

## Pré-PR

- [ ] Migration criada em `supabase/migrations/` com nome correto (YYYYMMDDHHMMSS)
- [ ] Migration testada em staging
- [ ] DDL checks: `SELECT * FROM ops.v_ddl_violations_unresolved` retorna 0
- [ ] CI gates: `SELECT * FROM ops.fn_ci_run_all_gates()` retorna apenas PASS/WARN
- [ ] Novo matview? Adicionado em `ops.matview_governance`
- [ ] Novo cron job? Registrado em `ops.cron_canonical_register`
- [ ] Nova view em `public`? Registrada em `ops.backcompat_view_allowlist`
- [ ] Alteração de storage bucket? Atualizada em `ops.storage_bucket_policy`
- [ ] Novo índice? Snapshotted em `ops.index_usage_snapshots`
- [ ] Nova function SECURITY DEFINER? `SET search_path` fixado, sem `public`
- [ ] ADR necessária? Criar em `docs/db/adrs/`

---

## Revisão de Código

- [ ] Nome de migration segue padrão YYYYMMDDHHMMSS?
- [ ] Migration é idempotente (usa `IF NOT EXISTS`, `CREATE OR REPLACE`)?
- [ ] DROP INDEX usa `CONCURRENTLY`?
- [ ] Não há DDL direto (sem migration)?
- [ ] Não há alterações em `evo` schema (Evolution API)?
- [ ] Não há FK `evo`→`zapp`?
- [ ] Não há `public` no `search_path` de SECURITY DEFINER functions?
- [ ] Novos objetos em `ops`? `GRANT` para service_role

---

## Pós-Deploy

- [ ] Migration aplicada em produção
- [ ] `ops.fn_ci_run_all_gates()` retorna apenas PASS
- [ ] Smoke tests passaram
- [ ] Monitoramento normal (sem spikes em latency)
- [ ] Verificar `ops.v_ddl_violations_unresolved` = 0
- [ ] Verificar cron jobs ativos (ops.v_cron_status)
- [ ] Verificar matviews atualizadas (ops.v_matview_stale)

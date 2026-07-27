# FUNCTIONS — zapp Database

> Catálogo de todas as funções dos schemas de negócio, classificadas por categoria.

---

## Classificação Geral

| Categoria | Count | Descrição |
|-----------|-------|-----------|
| A — Ativas | ~120 | Em uso, mantidas, com contrato |
| B — Legacy | ~20 | Deprecated, sem uso identificado |
| C — Extension | ~5 | Wrapper de extensões PostgreSQL |

---

## Funções de Negócio (zapp)

### Integração WhatsApp (Evolution API)

| Função | Retorno | Contrato |
|--------|---------|----------|
| `zapp.fn_ensure_evolution_backcompat_views()` | void | Cron 138, cada 6h |
| `zapp.evolution_webhook_handler(jsonb)` | void | INSERTE em evo.evolution_* |
| `zapp.fn_sync_contact_evolution(jid)` | void | Reconciliação de JID |

### Autenticação / Sessão

| Função | Retorno | Contrato |
|--------|---------|----------|
| `zapp.fn_create_session(token, user_id)` | uuid | Auth flow |
| `zapp.fn_validate_session(token)` | boolean | Auth middleware |

### Matviews

| Função | Schedule | Target |
|--------|----------|--------|
| `zapp.fn_refresh_matviews()` | Via cron | Todas as matviews |
| `zapp.fn_refresh_matview(name)` | Sob demanda | Uma matview específica |

---

## Funções Ops (ops)

| Função | Tipo | Purpose |
|--------|------|---------|
| `ops.fn_ddl_violation_scan(dry_run)` | SECURITY DEFINER | DDL audit |
| `ops.fn_ci_check_migration_versions()` | SECURITY DEFINER | CI gate |
| `ops.fn_ci_check_migration_duplicates()` | SECURITY DEFINER | CI gate |
| `ops.fn_ci_check_forbidden_fks()` | SECURITY DEFINER | CI gate |
| `ops.fn_ci_check_rls_coverage()` | SECURITY DEFINER | CI gate |
| `ops.fn_snapshot_index_usage()` | SECURITY DEFINER | Baseline de índices |
| `ops.fn_health_check()` | SECURITY DEFINER | Health endpoint |
| `ops.fn_run_all_ci_gates()` | SECURITY DEFINER | Meta CI gate |

---

## Regras de Segurança para Functions

1. **SECURITY DEFINER**: Toda function que acessa múltiplos schemas DEVE usar
   `SECURITY DEFINER` com `SET search_path = '<schema>, pg_catalog'`

2. **SECURITY INVOKER**: Funções de validação de entrada podem usar `SECURITY INVOKER`
   (sempre validar inputs mesmo que called por DEFiner)

3. **IMMUTABLE**: Funções de validação de domínio (ex: `fn_is_valid_jid`) DEVEM ser
   `IMMUTABLE` para permitir uso em índices e constraints

4. **VOLATILE**: Funções com efeitos colaterais (INSERT/UPDATE) são `VOLATILE` por padrão

5. **RETURNS TABLE**: Preferir `RETURNS TABLE` sobre `RETURNS SETOF` para CI gates
   (mais fácil de consultar em SELECT)

6. **ERROR contract**: Funções de erro devem usar `RAISE EXCEPTION USING ERRCODE = 'P0001'`
   para business errors (não usar return codes)

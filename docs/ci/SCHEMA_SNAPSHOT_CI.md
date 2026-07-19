# CI: Schema Snapshot & Diff

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [../SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


Fluxo de CI que reconstrói o snapshot do schema `public` por introspecção e compara com `supabase/migrations-snapshot/schema_public_full.sql`. Falha o build em qualquer divergência.

## 1. Pré-requisito: Supabase self-hosted

O job **não roda contra Lovable Cloud** (a senha do DB não é exposta ao usuário). É preciso um Postgres/Supabase self-hosted (ou replica read-only) acessível pela internet.

## 2. Provisionar usuário read-only

Aplique **uma vez** no self-hosted como superuser:

```bash
psql "$ADMIN_DB_URL" \
  -v ci_password="'GERE_UMA_SENHA_FORTE_AQUI'" \
  -f db/ci/2026-07-01_provision_ci_readonly.sql
```

O script:
- cria/atualiza role `ci_readonly` (LOGIN, NOSUPERUSER, NOBYPASSRLS)
- limita conexões (4) e statement_timeout (30s)
- concede apenas `USAGE` em `public` / `pg_catalog` / `information_schema`
- **não** concede `SELECT` em tabelas (só metadados)

Verifique:
```sql
\du ci_readonly
SELECT has_table_privilege('ci_readonly','public.profiles','SELECT'); -- deve retornar false
```

## 3. Secrets no GitHub Actions

Em **Settings → Secrets and variables → Actions** do repo `adm01-debug/zapp-web-v3`, adicione:

| Secret | Exemplo | Observação |
|---|---|---|
| `PGHOST`     | `db.meu-supabase.com`        | hostname do Postgres |
| `PGPORT`     | `5432`                       | ou `6543` (pgbouncer) |
| `PGUSER`     | `ci_readonly`                | role criada no passo 2 |
| `PGPASSWORD` | `<senha forte>`              | mesma passada em `-v ci_password` |
| `PGDATABASE` | `postgres`                   | database alvo |

O workflow usa `PGSSLMODE=require` por padrão.

## 4. Variáveis de ambiente (locais / dev)

Para rodar o script manualmente:

```bash
export PGHOST=... PGPORT=5432 PGUSER=ci_readonly \
       PGPASSWORD='...' PGDATABASE=postgres PGSSLMODE=require
./scripts/introspect-schema.sh /tmp/live.sql
diff -u supabase/migrations-snapshot/schema_public_full.sql /tmp/live.sql
```

## 5. Rodar manualmente no GitHub

1. **Actions** → **schema-snapshot** → **Run workflow**
2. Marque `commit_snapshot` se quiser auto-commit em caso de sucesso
3. Baixe o artifact `schema-diff-<run_id>`:
   - `schema.diff` — diff unified
   - `schema-diff.md` — resumo (usado no comment de PR)
   - `schema-diff.html` — visualização colorida

## 6. Comportamento esperado

| Cenário | Resultado |
|---|---|
| Sem `PGHOST` configurado | ⏭️ Skip com warning (não quebra CI) |
| Diff = 0 | ✅ Sucesso |
| Diff > 0 | ❌ Falha, artifact publicado, comment no PR |
| Rodado via `workflow_dispatch` + `commit_snapshot=true` + diff=0 | 🔄 Auto-commit `[skip ci]` |

## 7. Testes de validação (fazer após configurar)

Depois de setar os secrets, valide manualmente:

1. **Baseline verde**: rode via `workflow_dispatch` sem mudar nada → deve passar.
2. **Diff detectado**: aplique uma mudança proposital no self-hosted:
   ```sql
   CREATE TABLE public._ci_test_drift (id int);
   ```
   Rode o workflow → deve **falhar** e o artifact mostrar `+CREATE TABLE ... _ci_test_drift`.
3. **Rollback**: `DROP TABLE public._ci_test_drift;` → rode de novo → volta a passar.
4. **Cobertura**: confirme no artifact que o diff inclui:
   - policies RLS (seção `-- POLICIES`)
   - triggers (`-- TRIGGERS`)
   - grants em `anon/authenticated/service_role` (`-- GRANTS`)
   - constraints PK/FK/UNIQUE/CHECK (`-- CONSTRAINTS`)

## 8. Limitações conhecidas do introspector

- Não byte-idêntico a `pg_dump` (ordem de colunas em constraints multi-key pode variar)
- Não captura `COMMENT ON`, sequences órfãs, event triggers
- Owner statements omitidos (portável entre ambientes)
- Extensões `plpgsql` filtrada (built-in)

Para dump 100% fiel, use `pg_dump --schema-only --no-owner` no self-hosted.

# Plano de Unificação de Migrations (E28)

> ✅ **CONCLUÍDO em 2026-08-04 (PR #767).** Os 11 arquivos de `infra/migrations/` foram deletados
> (não movidos para `supabase/migrations/`). O DDL já aplicado está coberto pelo canônico
> `supabase/migrations/20260804000000_canonical_schema.sql`. Os 3 arquivos `.md` de auditoria
> foram removidos por serem históricos. O diretório `infra/migrations/` não existe mais.
> Este documento permanece como registro histórico do plano.

## Problema

Existem dois locais para migrations SQL no repositório:

| Local | Qtd | Rastreado pelo Supabase CLI? | Uso |
|-------|-----|------------------------------|-----|
| `supabase/migrations/` | 945 | ✅ Sim — via `schema_migrations` | Migrations de aplicação |
| `infra/migrations/` | ~~11~~ → **0** (deletado 2026-08-04, PR #767) | ❌ Não — aplicados via psql direto | Hotfixes operacionais de julho/2026 — **REMOVIDOS** |

Os 11 arquivos em `infra/migrations/` foram aplicados diretamente no banco de produção
durante a auditoria de 2026-07-11, fora do controle do Supabase CLI. Isso significa:

1. `supabase db reset` em staging NÃO os aplica
2. Um novo desenvolvedor não sabe que existem
3. Criação de novos ambientes (staging, preview branches) ficará dessincronizada

## Análise dos Arquivos em `infra/migrations/`

| Arquivo | Natureza | Risco de Re-aplicar |
|---------|----------|---------------------|
| `20260711_audit_cleanup.sql` | UPDATE em dados (alertas órfãos) | ⚠️ Idempotente se usar `WHERE resolved_at IS NULL` |
| `20260711_autovacuum_hotfix.sql` | ALTER SYSTEM / pg_reload | ⚠️ Requer superuser; idempotente |
| `20260711_autovacuum_round5.sql` | ALTER TABLE ... SET autovacuum_* | ✅ Idempotente |
| `20260711_robustez_autovacuum_indexes_stack.sql` | CREATE INDEX CONCURRENTLY | ✅ Idempotente com IF NOT EXISTS |
| `20260711_round4_cleanup.sql` | DROP/CREATE indexes, GRANT | ⚠️ Verificar IF NOT EXISTS |
| `20260711_security_revoke_anon_secdef.sql` | REVOKE/GRANT | ✅ Idempotente |
| `20260711_v3_gin_indexes_rpc_fix.sql` | CREATE/REPLACE FUNCTION | ✅ Idempotente |
| `20260711_vacuum_crons_and_purge_coverage.sql` | pg_cron, VACUUM | ⚠️ Crons duplicados se re-aplicado |

## Procedimento de Unificação

### Opção A — Mover para supabase/migrations/ (Recomendado)

```bash
# Converter para formato Supabase (adicionar timestamp ordenado após o último de 20260711)
# Verificar o último timestamp de 20260711 em supabase/migrations/
ls supabase/migrations/ | grep '^20260711' | sort | tail -5

# Mover com timestamp seguro (20260711_999xxx para ficar depois de tudo de 20260711)
git mv infra/migrations/20260711_autovacuum_hotfix.sql \
       supabase/migrations/20260711999001_autovacuum_hotfix.sql

git mv infra/migrations/20260711_audit_cleanup.sql \
       supabase/migrations/20260711999002_audit_cleanup.sql
# ... etc para cada arquivo
```

### Procedimento Passo a Passo

1. **Verificar qual foi o último timestamp de 20260711 em produção**

```sql
SELECT version FROM supabase_migrations.schema_migrations
WHERE version LIKE '20260711%'
ORDER BY version DESC
LIMIT 5;
```

2. **Tornar idempotente cada arquivo** antes de mover

Para cada SQL que pode falhar na re-aplicação, adicionar `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, ou wraps `DO $$ IF NOT EXISTS ... $$`.

3. **Mover os arquivos**

```bash
git mv infra/migrations/20260711_security_revoke_anon_secdef.sql \
       supabase/migrations/20260711999001_security_revoke_anon_secdef.sql

git mv infra/migrations/20260711_autovacuum_hotfix.sql \
       supabase/migrations/20260711999002_autovacuum_hotfix.sql

git mv infra/migrations/20260711_autovacuum_round5.sql \
       supabase/migrations/20260711999003_autovacuum_round5.sql

git mv infra/migrations/20260711_v3_gin_indexes_rpc_fix.sql \
       supabase/migrations/20260711999004_v3_gin_indexes_rpc_fix.sql

git mv infra/migrations/20260711_robustez_autovacuum_indexes_stack.sql \
       supabase/migrations/20260711999005_robustez_autovacuum.sql

git mv infra/migrations/20260711_round4_cleanup.sql \
       supabase/migrations/20260711999006_round4_cleanup.sql

git mv infra/migrations/20260711_vacuum_crons_and_purge_coverage.sql \
       supabase/migrations/20260711999007_vacuum_crons_purge_coverage.sql

git mv infra/migrations/20260711_audit_cleanup.sql \
       supabase/migrations/20260711999008_audit_cleanup.sql
```

4. **Registrar na tabela de rastreamento do DB** (DBA)

```sql
-- Inserir versões como já aplicadas (foram aplicadas manualmente)
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES
  ('20260711999001'),
  ('20260711999002'),
  ('20260711999003'),
  ('20260711999004'),
  ('20260711999005'),
  ('20260711999006'),
  ('20260711999007'),
  ('20260711999008')
ON CONFLICT (version) DO NOTHING;
```

5. **Manter infra/migrations/ para docs apenas**

Os arquivos `.md` (relatórios de auditoria) permanecem em `infra/migrations/`.

> **Nota (2026-08-04):** este passo foi superado — os `.md` de auditoria também foram
> deletados no PR #767 (registro histórico preservado em `docs/history/`).

### Opção B — Manter Separado com README

Alternativa menos intrusiva: criar um `infra/migrations/APPLY_ORDER.md` documentando
que esses arquivos devem ser aplicados manualmente em qualquer novo ambiente.

**Desvantagem:** O problema persiste — staging não os terá automaticamente.

## Status

| Item | Status |
|------|--------|
| Análise dos arquivos `infra/migrations/` | ✅ Completo (este doc) |
| Tornar idempotentes os SQLs | ✅ Obsoleto — DDL consolidado no canônico (PR #767) |
| git mv + INSERT na schema_migrations | ✅ Obsoleto — arquivos deletados, não movidos (PR #767) |
| Teste em staging pós-unificação | ✅ Obsoleto — resolvido por deleção; DDL coberto pelo canônico |

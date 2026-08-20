# Migration Drift — 2026-08-20 (Hermes)

## Resumo
- Runtime (`supabase_migrations.schema_migrations`): **770 versões aplicadas**.
- Repo (`supabase/migrations/*.sql`): **86 arquivos** (após squash canônico de 133 em 2026-08-04).
- **Drift: 684 versões no runtime SEM arquivo correspondente no repo.**

## Causa raiz
As 684 gaps foram aplicadas via `supabase_db_query` (MCP) durante as ondas de
auditoria/orquestração (sufixos `C01`, `G07B`, `A10001`, `FN01`, etc.), que gravam
em `schema_migrations` mas NÃO deixam arquivo de migration no repo. O squash
canônico `20260804000000_canonical_schema_squash_133_migrations.sql` colapsou as
133 primeiras; as 684 subsequentes nunca foram materializadas como arquivo.

## Ação (NÃO re-aplicar em prod)
- ⚠️ **Não criar DDL para as 684 gaps** — já estão aplicadas no runtime.
- Reaplicar via `supabase db push` causaria conflito de objeto existente.
- Próximas migrations devem SEMPRE ser arquivo em `supabase/migrations/` + apply
  via pipeline (`db-migrate.yml`), nunca via MCP direto.
- O livro de registro do repo foi fechado via
  `supabase/migrations/20260820000000_drift_version_stamps.sql` (somente
  `INSERT ... ON CONFLICT DO NOTHING` em `schema_migrations`, SEM DDL) para
  alinhar repo↔runtime sem alterar o banco.

## Evidência
- `C:/tmp/rt_versions.txt` (770 linhas do runtime)
- `C:/tmp/repo_versions.txt` (86 versões únicas do repo)
- Cruze: 0 pendentes de apply (tudo no repo já rodou); 684 dangling no runtime.

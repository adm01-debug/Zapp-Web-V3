# migrations-archive — Índice de migrations arquivadas

> Pasta de **arquivo morto** de `supabase/migrations/` — fora do escopo dos gates de CI
> (schema-drift, migration-lint, smoke-test). Histórico navegável da limpeza de 2026-08-19.
> **Nunca** mover nada daqui de volta para `supabase/migrations/` sem re-validar os gates.

## O que é isto

Durante o **Plano de Limpeza de Migrations (2026-08-19)**, 281 arquivos antigos
(versão entre `20260804000000` e `20260817000000` = BASELINE) foram **arquivados** aqui.

> **Exceção (2026-08-21, plano-100):** `20260807200000_ag06_sto_team_chat_files_owner_check.sql`
> foi **restaurado** para `supabase/migrations/` — o manifest marcava `in_snapshot=yes`, mas o
> snapshot de rebuild não é lido por `team-chat-comprehensive.test.tsx` (quality-gate) nem pelo
> apply-from-scratch do `migration-smoke-test`, ambos que só enxergam `supabase/migrations/*.sql`.
> A policy `auth_rw_teamfiles` está confirmada ao vivo em produção (`pg_policies`); sua ausência
> quebrava o teste sem risco algum em prod. Restam **280 arquivos** nesta pasta. Os demais 53
> arquivos do bloco `20260807…` não foram reauditados nesta sessão.

Motivo único: **o efeito de cada um já está consolidado** no snapshot de rebuild
(`scripts/decouple/snapshots/zapp_schema_snapshot.sql`) e/ou no squash canônico
(`supabase/migrations/20260804000000_canonical_schema_squash_133_migrations.sql`).
O aplicador (`apply-migrations.sh`) só considera versões **≥ BASELINE `20260817000000`**,
portanto estes arquivos **nunca mais seriam reaplicados** — mantê-los em
`supabase/migrations/` apenas poluía e criava ruído nos gates.

## Estrutura

Arquivos mantêm o nome original (`<versão14>_<tema>.sql`) para navegabilidade e
rastreabilidade via git. Para ver o conteúdo de qualquer um:

```bash
git log --all --oneline -- "docs/history/migrations-archive/<arquivo>"
git show <sha>^:"supabase/migrations/<arquivo>"   # conteúdo original
```

## Índice resumido (280 arquivos — ver nota de restauração acima; tabela abaixo reflete a contagem original de 281, `20260807…` já descontado do restaurado)

| Faixa | Tema dominante | Qtd |
|---|---|---|
| `20260804…` | RLS, fixes pós-canônico (delta), revokes | ~13 |
| `20260805…` | hardening RLS/secdef, grants, csat, perf | ~27 |
| `20260806…` | db01-db05, rb2, bugs fn/evo, buckets, ghost-removal | ~87 |
| `20260807…` | ag01/ag05/ag06, revokes, search_path, e2e, drops | ~54 |
| `20260808…` | security guard, policies, exec_sql hotfix, index drops | ~16 |
| `20260809…` | versioned drops, perf, lid, E-field (evo) | ~3 |
| `20260810…` | media migration M01-M08, pipeline health, n8n | ~5 |
| `20260811…` | LID campaign (fix 1-13, s2-s22), views, evo | ~8 |
| `20260812…` | LID s23-s27, scorecards | ~2 |
| `20260813…` | idx FK, notify/analyze, revoke views | ~4 |
| `20260814…` | security fixes, mirror rpcs | ~15 |
| `20260815…` | decouple e35-e80, lote1-lote9, moves | ~45 |
| `20260816…` | decouple e86, i1/i2, evo baseline, revokes | ~2 |

> A lista exata por arquivo está no manifest: `docs/ops/migrations-manifest.csv`
> (colunas `version, filename, file_present, db_record, db_name, bucket, action, risk`).

## Decisões associadas

- `docs/ops/MIGRATIONS_CLEANUP_DECISIONS.md` — listas de exclusão/escrita aprovadas no CP-2.
- `docs/ops/MIGRATIONS-DRIFT.md` — medição atualizada do drift repo×DB pós-limpeza.
- `supabase/migrations/README.md` — guia canônico de migrations (modelo DB-as-source, gates, template).

## Tombstones (órfãos DB com objeto morto — NÃO viraram arquivo)

206 registros em `schema_migrations` sem arquivo correspondente (objeto já DROPADO ou
operação pontual: comments/índices one-shot). Documentados no manifest com `action=TOMBSTONE`.
Não criar arquivos para eles; não apagar os registros do ledger (histórico de aplicação).

## Segurança

- **Nenhum DROP/ALTER foi executado no banco de produção** nesta operação — apenas
  movimentação de arquivos no repo + registro de 1 migration de reconciliação (no-op).
- Rollback de tudo = descartar a branch `chore/migrations-cleanup-20260819` (additive-em-branch).
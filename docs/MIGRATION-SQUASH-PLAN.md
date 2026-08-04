# Migration Baseline Squash Plan

## ✅ CONCLUÍDO (2026-08-04) — Remoção de `infra/migrations/`

A parte referente a `infra/migrations/` deste plano foi **concluída por deleção** no **PR #767**:

- O diretório `infra/migrations/` foi **removido** (8 `.sql` + 3 `.md` + demais artefatos de infra deletados).
- O DDL está coberto pelo canônico **`supabase/migrations/20260804000000_canonical_schema.sql`**.
- Não há mais migrations fora do controle do Supabase CLI.
- As seções abaixo permanecem como registro histórico do plano de squash das migrations de `supabase/migrations/`.

## Situação Atual

| Métrica | Valor |
|---------|-------|
| Total de arquivos em `supabase/migrations/` | 945 |
| Arquivos UUID-nomeados (Lovable auto-gen) | ~500 |
| Arquivos 2025 (todos aplicados em produção) | 42 |
| Arquivos 2026 (maioria aplicados em produção) | 895 |
| Tamanho total | 6,1 MB |
| Arquivos em `infra/migrations/` (aplicados direto, fora do CLI) | ~~11~~ → **0** (deletado 2026-08-04, PR #767) |

Com 945 arquivos, `supabase db reset` em staging/dev demora 15+ minutos e é
propenso a falhas por dependências circulares entre migrations antigas.

## Estratégia: Squash Parcial com Baseline Freeze

### Princípio

NÃO apagar histórico que ainda pode ser necessário para rollback. Em vez disso:

1. **Criar um baseline snapshot** do estado atual do banco (schema completo)
2. **Arquivar** migrations até um ponto de corte para um subdiretório
3. **Manter** migrations pós-corte como incrementais normais
4. **Registrar** as migrations arquivadas na tabela `schema_migrations` como se fossem uma única entrada

### Ponto de Corte Recomendado

```
20260700000000  (início de julho/2026)
```

Reasoning: todas as migrations até `20260630*` são definitivamente aplicadas em produção
e têm meses de stabilidade. O trabalho de julho/2026 tem mais risco de rollback.

## Procedimento

### Fase 1 — Verificar Pré-Condições (DBA)

```sql
-- 1. Quantas migrations estão na tabela de rastreamento?
SELECT COUNT(*) FROM supabase_migrations.schema_migrations;

-- 2. Confirmar que todas as migrations até junho/2026 foram aplicadas
SELECT COUNT(*) FROM supabase_migrations.schema_migrations
WHERE version < '20260700000000';

-- 3. Verificar se há migrations não rastreadas (diff)
-- (comparar output com: ls supabase/migrations/ | awk -F_ '{print $1}' | sort)
SELECT version FROM supabase_migrations.schema_migrations
WHERE version < '20260700000000'
ORDER BY version;
```

### Fase 2 — Gerar Baseline Snapshot

```bash
# Extrair schema completo do DB de produção (SEM dados)
pg_dump "$SUPABASE_DB_URL" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --schema=zapp \
  --schema=evo \
  --schema=bpm \
  --schema=email_app \
  --schema=ai \
  --schema=financeiro \
  --schema=vendas \
  --schema=ops \
  > supabase/migrations/00000000000000_BASELINE_SNAPSHOT.sql
```

### Fase 3 — Arquivar Migrations Antigas

```bash
mkdir -p supabase/migrations/_archived_pre_202607

# Mover migrations até junho/2026
for f in supabase/migrations/2024* supabase/migrations/2025* supabase/migrations/20260[1-6]*; do
  mv "$f" supabase/migrations/_archived_pre_202607/
done

# Verificar o que ficou
ls supabase/migrations/ | grep -v '^_' | wc -l  # deve ser ~300
```

### Fase 4 — Atualizar Rastreador (DBA)

```sql
-- Registrar o baseline como se fosse aplicado (substitui todas as antigas)
BEGIN;

-- Remover entradas antigas do rastreador
DELETE FROM supabase_migrations.schema_migrations
WHERE version < '20260700000000';

-- Inserir entrada do baseline
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('00000000000000');

COMMIT;
```

### Fase 5 — Testar em Staging

```bash
# 1. Criar banco de staging limpo
supabase db reset --db-url "$STAGING_DB_URL"

# 2. Verificar tempo de reset
time supabase db reset --db-url "$STAGING_DB_URL"

# 3. Rodar smoke tests
bun run smoke:pre-deploy
```

## Critérios de Aprovação

| Critério | Verificação |
|----------|-------------|
| `supabase db reset` completa em < 5 min | `time` no staging |
| Todos os schemas presentes pós-reset | `\dn` no psql |
| Zero erros TypeScript | `bun run typecheck` |
| 2088 testes passam | `bun run test` |
| Smoke tests OK | `bun run smoke:pre-deploy` |

## Migrations em `infra/migrations/` (Não Rastreadas)

> **✅ Resolvido (2026-08-04, PR #767):** o diretório `infra/migrations/` foi **removido**.
> Os 11 arquivos haviam sido aplicados diretamente via psql
> (fora do controle do Supabase CLI). Eles cobriam:

- `20260711_audit_cleanup.sql` — limpeza de logs antigos
- `20260711_autovacuum_hotfix.sql` — parâmetros de autovacuum
- `20260711_security_revoke_anon_secdef.sql` — hardening de segurança
- `20260711_v3_gin_indexes_rpc_fix.sql` — índices GIN
- etc.

**Status:** todos os arquivos foram **deletados** — o DDL já aplicado em produção está
coberto pelo canônico `supabase/migrations/20260804000000_canonical_schema.sql`.
Não há mais migrations fora do controle do Supabase CLI.

**Ação para E28:** Ver `docs/MIGRATION-UNIFICATION-PLAN.md` (marcado ✅ CONCLUÍDO).

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Baseline snapshot incompleto | Baixa | Verificar com `pg_dump --schema-only` e rodar tests |
| Migration arquivada ainda não aplicada em algum env | Baixa | Verificar `schema_migrations` antes de arquivar |
| Perda de histórico git das migrations | Nenhuma | `git mv` preserva histórico; não é `git rm` |
| Staging drift vs produção | Média | Aplicar baseline snapshot, depois incrementais de julho/2026 |

## Status

| Fase | Status |
|------|--------|
| Documentação do plano | ✅ Pronto |
| Remoção de `infra/migrations/` (PR #767) | ✅ Concluído 2026-08-04 |
| Verificação de pré-condições (DBA) | ⏳ Pendente autorização |
| Baseline snapshot | ⏳ Pendente acesso ao DB de produção |
| Arquivamento de migrations | ⏳ Pendente staging disponível |
| Teste pós-squash em staging | ⏳ Pendente staging disponível |
| Aplicação em produção | ⏳ Pendente todas as fases anteriores |

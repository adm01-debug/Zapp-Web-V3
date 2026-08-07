# AGENTS — Instruções para LLMs e Agentes de IA

> Regras operacionais quando LLMs/Agentes modificam o banco de dados.

---

## 50-Step Plan (2026-07-27)

| Step | Tarefa | Status |
|------|--------|--------|
| 1-8 | Docs base (STAGING, DDL-FREEZE, SCHEMA-CONTRACT, ADRs 001-003) | ✅ |
| 9 | Repatriar tabelas evo→ops (documentado) | 📋 |
| 10 | Consolidar cron backcompat (ops.backcompat_view_allowlist) | ✅ |
| 11 | Fronteira zapp↔evo views (ADR-DB-002) | ✅ |
| 12-15 | Schema docs (ops, evo, public, bpm) | ✅ |
| 16-18 | Migration audit (ops.migration_audit, corrections, source registry) | ✅ |
| 19 | Domain JID (evo.jid, zapp.jid) | ✅ |
| 20-21 | RLS + FK audit (ops.v_rls_gaps, ops.v_cross_schema_fks) | ✅ |
| 22 | Storage bucket policy (ops.storage_bucket_policy) | ✅ |
| 23-24 | SCHEMA-CONTRACT expandido (CI checks CI-01 a CI-05) | ✅ |
| 25-27 | Index governance (baseline, quarantine, duplicate drop) | ✅ |
| 28 | Missing index fixes (5 candidatos) | ✅ |
| 29 | VACUUM/autovacuum policy | ✅ |
| 30 | Matview governance (6 matviews) | ✅ |
| 31 | Slow query SLA | ✅ |
| 32 | Cron canonical register | ✅ |
| 33 | Cron naming/idempotency standards | ✅ |
| 34 | Cron thundering herd | ✅ |
| 35 | Cron failure alerting | ✅ |
| 36 | External dependencies | ✅ |
| 37 | DR/backup crons | ✅ |
| 38 | Observability dashboard | ✅ |
| 39 | ARCHITECTURE.md expandido | ✅ |
| 40 | Per-schema docs (schemas/) | ✅ |
| 41 | Auto-generation tooling | ✅ |
| 42 | AGENTS.md (este arquivo) | ✅ |
| 43 | CI contract enforcement (fn_ci_run_all_gates) | ✅ |
| 44-50 | Governance, PR checklist, onboarding, Wave 5 | ✅ |

---

## Constraints para LLMs/Agentes

### ✅ PODE FAZER
- Criar migrations em `supabase/migrations/YYYYMMDDHHMMSS_descricao.sql`
- Criar views/monitores em `ops` schema
- Criar ADR em `docs/db/adrs/`
- Criar/atualizar docs em `docs/db/`
- Executar SELECT/read-only queries

### ❌ NÃO PODE FAZER
- Executar DDL em produção sem migration versionada
- Criar tabelas em `evo` (Evolution API schema)
- Criar FKs de `evo` para `zapp` (SCHEMA-CONTRACT violation)
- Criar views em `public` sem registrar em `ops.backcompat_view_allowlist`
- Mover extensões do schema `public` (ADR-DB-003: DEFERIDO)
- Fazer `DROP INDEX` sem `CONCURRENTLY`
- Fazer `DROP INDEX CONCURRENTLY` dentro de transaction
- Modificar `cron.job` sem via `supabase db push`
- Alterar buckets com PII para public (whatsapp-media, recibos-entrega)

---

## Padrão de Migration

```
supabase/migrations/YYYYMMDDHHMMSS_descricao.sql
```

Exemplo: `20260801000001_add_phone_to_contatos.sql`

Regras:
1. Nome: 14 dígitos + underscore + descrição em snake_case
2. NUNCA usar pontos ou caracteres especiais
3. CREATE/DROP INDEX → `CONCURRENTLY` sempre
4. DROP INDEX → fora de transaction
5. TESTAR EM STAGING antes de push

---

## Processo de CI/CD

```bash
# 1. Criar migration
touch supabase/migrations/20260801000001_descricao.sql

# 2. Testar em staging
supabase db push --db-url postgresql://user:<SECRETO>@staging:5432/postgres

# 3. Validar gates
psql $STAGING_URL -c "SELECT * FROM ops.fn_ci_run_all_gates();"

# 4. Code review + merge para main

# 5. Push produção
supabase db push --db-url postgresql://user:<SECRETO>@prod:5432/postgres
```

---

## Error Codes (ERROR-CONTRACT.md)

Sempre usar SQLSTATE `P0001` para erros de negócio:

```sql
RAISE EXCEPTION USING
    errcode = 'P0001',
    message = 'BUSINESS_ERROR_CODE:Descrição em português';
```

---

## Index Naming

```
{tabela}_{coluna(s)}_{tipo}
```

Exemplos:
- `contatos_nome_trgm` (GIN trigram)
- `evolution_messages_created_at_idx` (btree)
- `messages_conv_id_conversation_id_idx` (composite)
```

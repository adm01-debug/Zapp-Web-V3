# supabase/ci — CI Baseline Schema

## Baseline gerado em 2026-08-04

O arquivo `baseline-schema-2026-08-04.sql.gz` é o snapshot canônico do schema de produção,
gerado via `pg_dump --schema-only` da instância self-hosted em `https://supabase.atomicabr.com.br`.

### Métricas do baseline

| Métrica | Valor |
|---------|-------|
| Data de geração | 2026-08-04 |
| Schemas incluídos | zapp, evo, bpm, email_app, ai, archive, financeiro, vendas, ops |
| Tabelas físicas (total) | 704 CREATE TABLEs no dump |
| Schema `zapp` | 321 tabelas físicas, 380 views |
| Schema `evo` | 172 tabelas (raízes + partições WhatsApp) |
| Linhas de SQL | 105.770 |
| Tamanho comprimido | 533.090 bytes (521 KB) |
| Tamanho descomprimido | 3.692.805 bytes (3,5 MB) |

### SHA-256 (checksums em `baseline-schema-2026-08-04.sha256`)

```
cbdecfa97dc507475a135626feb004c80a8e31f2776e39260f0b74d2e2673b5c  .gz
3e7dc8c32a9fc0135ec37c31fb2f1b63029fd1b69e1f9f6e2c1539cc075ea1b6  .sql
```

### Localização nos backups

O arquivo também está salvo nos backups do VPS:
- **Container de backup**: `/backups/baseline-schema-2026-08-04.sql.gz`
- **R2**: incluído nos backups automáticos com retenção de 14 dias

### Como obter o arquivo

```bash
# Na raiz do repositório:
bash supabase/ci/download-baseline.sh
```

O script tenta:
1. `docker cp` do container de backup (se executado no VPS)
2. Regerar via `pg_dump` direto (se `PGPASSWORD` e `DATABASE_URL` configurados)

### Comando de regeneração manual

```bash
pg_dump \
  --schema-only \
  --no-owner \
  --no-acl \
  -n zapp -n evo -n bpm -n email_app -n ai -n archive \
  -n financeiro -n vendas -n ops \
  postgresql://postgres:SENHA@localhost:5432/postgres \
  > supabase/ci/baseline-schema-2026-08-04.sql
```

### Uso em CI

Para testar migrações contra o baseline:

```bash
# 1. Restaurar baseline em banco de teste
psql "$TEST_DATABASE_URL" < supabase/ci/baseline-schema-2026-08-04.sql

# 2. Aplicar todas as migrations
supabase db push --db-url "$TEST_DATABASE_URL"

# 3. Verificar se não há erros
supabase db diff --db-url "$TEST_DATABASE_URL"
```

> **Nota:** O arquivo `.sql` em si NÃO está commitado no git por ser um binário de 3,5 MB
> (não adequado para versionamento direto). Use `download-baseline.sh` para obtê-lo localmente.
> Próxima revisão recomendada: **2026-09-01**.

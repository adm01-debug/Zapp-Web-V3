# postgres-evolution migrations

SQL aplicado ao postgres:14 (evolution DB — container `postgres_postgres`).

Diferente das migrations em `supabase/migrations/` (que rodam no Supabase PG 15),
estes scripts se aplicam ao banco de dados da Evolution API.

## Como aplicar

```bash
psql -d evolution -U postgres -f <arquivo>.sql
```

## Convenção de nomes

`YYYYMMDDHHMMSS_descricao.sql` — mesmo padrão do Supabase.

## Arquivos

| Arquivo | Descrição |
|---|---|
| `20260808280000_role_guardrails_statement_timeout.sql` | statement_timeout + idle_in_transaction para evolution_app, n8n_app, n8n_ro |
